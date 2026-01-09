import { fetch } from "@tauri-apps/plugin-http";

/**
 * 支持的 HTTP 方法类型
 */
export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

/**
 * 单次请求参数配置（像 Axios 的 config）
 * @property method 请求方法，GET/POST/PUT/DELETE
 * @property headers 自定义请求头
 * @property params URL 查询参数（像 Axios 的 params）
 * @property data 请求体，支持 JSON、FormData、URLSearchParams
 * @property responseType 是否以二进制（arraybuffer）形式返回（像 Axios 的 responseType）
 */
export interface HttpParams {
  method: HttpMethod;
  headers?: Record<string, string>;
  params?: Record<string, any>;
  data?: any;
  responseType?: "json" | "arraybuffer";
}

/**
 * 创建 HttpClient 时的可选配置项
 * @property baseURL API 基础路径，所有请求会自动拼接此路径
 * @property headers 全局默认请求头，例如 { 'Content-Type': 'application/json' }
 * @property timeout 超时时间，单位毫秒，超时后自动 reject
 */
export interface HttpClientConfig {
  baseURL: string;
  headers?: Record<string, string>;
  timeout?: number;
}

/**
 * 请求拦截器函数类型
 * @param config 当前请求的 config
 * @returns 可同步或异步返回修改后的 config
 */
export type RequestInterceptor = (config: HttpParams) => Promise<HttpParams> | HttpParams;

/**
 * 响应拦截器函数类型
 * @param response 原始响应数据
 * @returns 可同步或异步返回处理后的数据
 */
export type ResponseInterceptor = (response: any) => Promise<any> | any;

/**
 * HttpClient 类，封装 Tauri fetch，像 Axios 一样使用，支持拦截器
 */
export class HttpClient {
  private baseURL: string;
  private headers: Record<string, string>;
  private timeout?: number;
  private requestInterceptors: RequestInterceptor[] = [];
  private responseInterceptors: ResponseInterceptor[] = [];
  /**
   * 拦截器管理对象，像 Axios 的 interceptors
   */
  public interceptors = {
    request: {
      use: (fn: RequestInterceptor) => {
        this.requestInterceptors.push(fn);
      }
    },
    response: {
      use: (fn: ResponseInterceptor) => {
        this.responseInterceptors.push(fn);
      }
    }
  };

  private constructor(config: HttpClientConfig) {
    this.baseURL = config.baseURL;
    this.headers = config.headers || {};
    this.timeout = config.timeout;
  }

  /**
   * 静态工厂方法，创建 HttpClient 实例
   * @param config 配置项，包括 baseURL、headers、timeout
   * @example
   * const client = HttpClient.create({
   *   baseURL: 'https://api.example.com',
   *   headers: { 'Content-Type': 'application/json' },
   *   timeout: 5000
   * });
   */
  public static create(config: HttpClientConfig): HttpClient {
    return new HttpClient(config);
  }

  /**
   * 发起 HTTP 请求，像 Axios 的 request
   * @param url 请求相对路径
   * @param config 单次请求参数（method, headers, params, data 等）
   */
  public async request<T>(url: string, config: HttpParams = { method: "GET" }): Promise<T> {
    // 1. 应用请求拦截器
    const reqConfig = await this.applyRequestInterceptors(config);

    // 2. 构建 Headers 并合并默认头
    const headers = new Headers({
      ...this.headers,
      ...(reqConfig.headers || {})
    });

    if (reqConfig.data instanceof FormData || reqConfig.data instanceof URLSearchParams) {
      headers.delete("Content-Type");
    }

    const fetchOptions: RequestInit = { method: reqConfig.method, headers };

    // 3. 处理请求体
    if (reqConfig.data) {
      fetchOptions.body =
        reqConfig.data instanceof FormData || reqConfig.data instanceof URLSearchParams
          ? reqConfig.data
          : JSON.stringify(reqConfig.data);
    }

    // 4. 构建完整的请求 URL（自动拼接 params）
    const fullUrl = new URL(url, this.baseURL);
    if (reqConfig.params) {
      Object.entries(reqConfig.params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          fullUrl.searchParams.append(key, String(value));
        }
      });
    }

    // 5. 执行超时控制
    let timer: NodeJS.Timeout | undefined;
    const timeoutPromise = this.timeout
      ? new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Request timeout")), this.timeout);
      })
      : Promise.resolve();

    try {
      const resp: Response = await Promise.race([
        fetch(fullUrl.toString(), fetchOptions as any),
        timeoutPromise
      ] as any);
      if (timer) clearTimeout(timer);

      if (!resp.ok) {
        throw new Error(`HTTP error! status: ${resp.status}`);
      }

      // 6. 解析返回数据
      const data: any = reqConfig.responseType === "arraybuffer" ? await resp.arrayBuffer() : await resp.json();

      // 7. 应用响应拦截器
      return await this.applyResponseInterceptors(data);
    } catch (error) {
      return Promise.reject(error);
    }
  }

  /**
   * GET 请求，像 Axios 的 get
   */
  public get<T>(url: string, config: Omit<HttpParams, "method"> = {}): Promise<T> {
    return this.request<T>(url, { ...config, method: "GET" });
  }

  /**
   * POST 请求，像 Axios 的 post
   */
  public post<T>(url: string, data?: any, config: Omit<HttpParams, "method" | "data"> = {}): Promise<T> {
    return this.request<T>(url, { ...config, method: "POST", data });
  }

  /**
   * PUT 请求，像 Axios 的 put
   */
  public put<T>(url: string, data?: any, config: Omit<HttpParams, "method" | "data"> = {}): Promise<T> {
    return this.request<T>(url, { ...config, method: "PUT", data });
  }

  /**
   * DELETE 请求，像 Axios 的 delete
   */
  public delete<T>(url: string, config: Omit<HttpParams, "method"> = {}): Promise<T> {
    return this.request<T>(url, { ...config, method: "DELETE" });
  }

  /**
   * 上传文件，像 Axios 的 post 但指定 FormData
   */
  public upload<T>(url: string, data: FormData, config: Omit<HttpParams, "method" | "data"> = {}): Promise<T> {
    return this.request<T>(url, { ...config, method: "POST", data });
  }

  /**
   * 应用所有请求拦截器
   */
  private async applyRequestInterceptors(config: HttpParams): Promise<HttpParams> {
    let currentConfig = config;
    for (const interceptor of this.requestInterceptors) {
      currentConfig = await interceptor(currentConfig);
    }
    return currentConfig;
  }

  /**
   * 应用所有响应拦截器
   */
  private async applyResponseInterceptors(response: any): Promise<any> {
    let result = response;
    for (const interceptor of this.responseInterceptors) {
      result = await interceptor(result);
    }
    return result;
  }
}

export default HttpClient;

