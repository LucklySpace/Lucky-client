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

// import { fetch } from "@tauri-apps/plugin-http";

// /**
//  * 支持的 HTTP 方法类型
//  */
// export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

// /**
//  * 单次请求参数配置
//  * @property method 请求方法，GET/POST/PUT/DELETE
//  * @property headers 自定义请求头
//  * @property query URL 查询参数
//  * @property body 请求体，支持 JSON、FormData、URLSearchParams
//  * @property isBlob 是否以二进制（ArrayBuffer）形式返回
//  */
// export interface HttpParams {
//   method: HttpMethod;
//   headers?: Record<string, string>;
//   query?: Record<string, any>;
//   body?: any;
//   isBlob?: boolean;
// }

// /**
//  * 创建 HttpClient 时的可选配置项
//  * @property baseURL API 基础路径，所有请求会自动拼接此路径
//  * @property defaultHeaders 全局默认请求头，例如 { 'Content-Type': 'application/json' }
//  * @property timeout 超时时间，单位毫秒，超时后自动 reject
//  */
// export interface HttpClientConfig {
//   baseURL: string;
//   defaultHeaders?: Record<string, string>;
//   timeout?: number;
// }

// /**
//  * 请求拦截器函数类型
//  * @param config 当前请求的 url 与参数
//  * @returns 可同步或异步返回修改后的 url 与参数
//  */
// export type RequestInterceptor = (config: {
//   url: string;
//   options: HttpParams;
// }) => Promise<{ url: string; options: HttpParams }> | { url: string; options: HttpParams };

// /**
//  * 响应拦截器函数类型
//  * @param response 原始响应，包含 data Promise 和原生 Response 对象
//  * @returns 可同步或异步返回处理后的数据或完整响应
//  */
// export type ResponseInterceptor = (response: { data: ResponseData | any; resp: Response }) => Promise<any> | any;

// /**
//  * 完整的响应结果类型
//  */
// //export type FullResponse = { data: Promise<any>; resp: Response };

// export type FullResponse = { data: ResponseData | any; resp: Response };

// /**
//  * HttpClient 类，封装 Tauri fetch，为请求和响应提供拦截器
//  */
// export class HttpClient {
//   private baseURL: string;
//   private defaultHeaders: Record<string, string>;
//   private timeout?: number;
//   private requestInterceptors: RequestInterceptor[] = [];
//   private responseInterceptors: ResponseInterceptor[] = [];

//   /**
//    * 构造函数，私有仅能通过 create 方法调用
//    */
//   private constructor(config: HttpClientConfig) {
//     this.baseURL = config.baseURL;
//     this.defaultHeaders = config.defaultHeaders || {};
//     this.timeout = config.timeout;
//   }

//   /**
//    * 静态工厂方法，创建 HttpClient 实例
//    * @param config 配置项，包括 baseURL、默认请求头、超时
//    * @example
//    * const client = HttpClient.create({
//    *   baseURL: 'https://api.example.com',
//    *   defaultHeaders: { 'Content-Type': 'application/json' },
//    *   timeout: 5000
//    * });
//    */
//   public static create(config: HttpClientConfig): HttpClient {
//     return new HttpClient(config);
//   }

//   /**
//    * 拦截器管理对象
//    */
//   public interceptors = {
//     /**
//      * 请求拦截器管理
//      */
//     request: {
//       /**
//        * 添加请求拦截器
//        * @param fn 拦截器函数
//        */
//       use: (fn: RequestInterceptor) => {
//         this.requestInterceptors.push(fn);
//       }
//     },
//     /**
//      * 响应拦截器管理
//      */
//     response: {
//       /**
//        * 添加响应拦截器
//        * @param fn 拦截器函数
//        */
//       use: (fn: ResponseInterceptor) => {
//         this.responseInterceptors.push(fn);
//       }
//     }
//   };

//   /**
//    * 应用所有请求拦截器
//    */
//   private async applyRequestInterceptors(url: string, options: HttpParams) {
//     let cfg = { url, options };
//     for (const interceptor of this.requestInterceptors) {
//       cfg = await interceptor(cfg);
//     }
//     return cfg;
//   }

//   /**
//    * 应用所有响应拦截器
//    */
//   private async applyResponseInterceptors(fullResp: FullResponse) {
//     let result: any = fullResp;
//     for (const interceptor of this.responseInterceptors) {
//       result = await interceptor(result);
//     }
//     return result;
//   }

//   /**
//    * 发起 HTTP 请求
//    * @param url 请求相对路径
//    * @param options 单次请求参数
//    * @param fullResponse 是否返回完整 Response 对象，默认为 false
//    */
//   public async request<T>(url: string, options: HttpParams, fullResponse = false): Promise<T | FullResponse> {
//     // 1. 请求拦截器
//     const { url: reqUrl, options: reqOpts } = await this.applyRequestInterceptors(url, options);

//     // 2. 构建 Headers 并合并默认头
//     const headers = new Headers({
//       ...this.defaultHeaders,
//       ...(reqOpts.headers || {})
//     });

//     if (reqOpts.body instanceof FormData || reqOpts.body instanceof URLSearchParams) {
//       // 浏览器/插件会自动设置 Content-Type，包括 boundary
//       headers.delete("Content-Type");
//     }

//     const fetchOptions: RequestInit = { method: reqOpts.method, headers };

//     // 3. 处理请求体
//     if (reqOpts.body) {
//       fetchOptions.body =
//         reqOpts.body instanceof FormData || reqOpts.body instanceof URLSearchParams
//           ? reqOpts.body
//           : JSON.stringify(reqOpts.body);
//     }

//     // 4. 构建完整的请求 URL（自动拼接查询参数）
//     //const surl = new URL(reqUrl, this.baseURL);

//     const surl = resolveUrl(reqUrl, this.baseURL);

//     // 若存在查询参数，则依次添加
//     if (reqOpts.query && typeof reqOpts.query === "object") {
//       Object.entries(reqOpts.query).forEach(([key, value]) => {
//         if (value !== undefined && value !== null) {
//           surl.searchParams.append(key, String(value));
//         }
//       });
//     }

//     const fullUrl = surl.toString();

//     console.log("fullUrl", fullUrl);
//     console.log("fetchOptions", fetchOptions);

//     // 5. 执行超时控制，如果配置了 timeout
//     let timer: NodeJS.Timeout;
//     const timeoutPromise = new Promise<never>((_, rej) => {
//       if (this.timeout) {
//         timer = setTimeout(() => rej(new Error("Request timeout")), this.timeout);
//       }
//     });

//     try {
//       // 并行触发 fetch 与超时
//       const resp: Response = await Promise.race([fetch(fullUrl, fetchOptions as any), timeoutPromise] as any);
//       clearTimeout(timer!);

//       if (!resp.ok) {
//         throw new Error(`HTTP error! status: ${resp.status}`);
//       }

//       // 6. 解析返回数据
//       const data: ResponseData = reqOpts.isBlob ? await resp.arrayBuffer() : await resp.json();
//       const fullRespObj: FullResponse = { data, resp };

//       // 7. 响应拦截器
//       const processed = await this.applyResponseInterceptors(fullRespObj);

//       // return fullResponse ? processed : processed;
//       return fullResponse ? processed : processed.data ?? processed;
//     } catch (error) {
//       // 可在此扩展错误拦截器
//       return Promise.reject(error);
//     }
//   }

//   /**
//    * GET 请求
//    */
//   public get<T>(url: string, query?: Record<string, any>) {
//     return this.request<T>(url, { method: "GET", query });
//   }

//   /**
//    * POST 请求
//    */
//   public post<T>(url: string, body?: any) {
//     return this.request<T>(url, { method: "POST", body });
//   }

//   /**
//    * PUT 请求
//    */
//   public put<T>(url: string, body?: any) {
//     return this.request<T>(url, { method: "PUT", body });
//   }

//   /**
//    * DELETE 请求
//    */
//   public delete<T>(url: string) {
//     return this.request<T>(url, { method: "DELETE" });
//   }

//   /**
//    * DELETE 请求
//    */
//   public upload<T>(url: string, body?: any, headers?: Record<string, string>) {
//     return this.request<T>(url, { method: "POST", body, headers });
//   }
// }

// export default HttpClient;

// /**
//  * 将 reqUrl 解析为 URL 实例（兼容完整地址 & 相对地址）
//  * @param reqUrl 用户传入的 url，可能是完整地址或相对路径
//  * @param baseURL 可选的 baseURL（可能为空字符串）
//  * @throws 当无法解析相对 URL 且没有可用 base 时抛出 Error
//  */
// function resolveUrl(reqUrl: string, baseURL?: string): URL {
//   // 防御性处理：trim 空白
//   const raw = (reqUrl ?? "").trim();

//   if (!raw) {
//     throw new Error("resolveUrl: reqUrl 为空");
//   }

//   // 首先尝试直接用 new URL 解析（对绝对 URL 有效）
//   try {
//     return new URL(raw); // 成功说明是绝对 URL（含 scheme）
//   } catch (e) {
//     // 失败则说明不是一个完整带 scheme 的 URL（或是以 '//' 开头的 protocol-relative）
//     // 继续用 baseURL 或 window.location 作为 base 来解析
//   }

//   const base = (baseURL ?? "").trim();

//   if (base) {
//     // 如果提供了 baseURL，则使用它（new URL 会处理 base 是否带末尾斜杠）
//     try {
//       return new URL(raw, base);
//     } catch (err) {
//       throw new Error(`resolveUrl: 以提供的 baseURL 解析失败。baseURL=${base},reqUrl=${raw}。错误：${err}`);
//     }
//   }

//   // 如果在浏览器环境中，可用 window.location.href 作为 base
//   if (typeof window !== "undefined" && window.location && window.location.href) {
//     try {
//       return new URL(raw, window.location.href);
//     } catch (err) {
//       throw new Error(`resolveUrl: 使用 window.location 作为 base 解析失败。reqUrl=${raw}。错误：${err}`);
//     }
//   }

//   // 到这里说明既不是绝对 URL，也没有可用的 base（例如在 Node 环境且没有传 base）
//   throw new Error("resolveUrl: 无法解析相对 URL,缺少 baseURL。请传入完整地址或提供 baseURL。");
// }

// // // 创建实例，配置 baseURL、默认头与超时
// // const Http = HttpClient.create({
// //   baseURL: import.meta.env.VITE_API_SERVER,
// //   defaultHeaders: { "Content-Type": "application/json" },
// //   timeout: 10000,
// // });

// // // 添加请求拦截器（如：注入 Token）
// // Http.interceptors.request.use(async ({ url, options }) => {
// //   // 添加token
// //   if (storage.get("token")) {
// //     options.headers = {
// //       ...options.headers,
// //       Authorization: `Bearer ${storage.get("token")}`,
// //     };
// //   }
// //   return { url, options };
// // });

// // // 添加响应拦截器（如：全局错误处理）
// // Http.interceptors.response.use(async ({ data, resp }) => {
// //   // data 已解析 JSON
// //   if (data.code === 401) {
// //     // 处理登录过期
// //   }
// //   if (data.code === 500) {
// //     // 服务器内部错误
// //   }

// //   return data;
// // });

// //  // 普通 GET 请求
// //  api.get('/users', { page: 1, size: 20 }).then(users => console.log(users));

// //  // POST 请求
// //  api.post('/login', { username: 'test', password: '123456' })
// //    .then(tokenInfo => console.log(tokenInfo));

// //  // 获取完整响应
// //  api.request('/download/report', { method: 'GET', isBlob: true }, true)
// //    .then(({ data, resp }) => {
// //      data.then(buffer => saveFile(buffer));
// //    });
