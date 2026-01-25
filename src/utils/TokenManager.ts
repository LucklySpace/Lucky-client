// token-manager.ts
import { appDataDir, join } from "@tauri-apps/api/path";
import { load as loadStore, Store } from "@tauri-apps/plugin-store";
import { Client, Stronghold, Store as StrongholdStore } from "@tauri-apps/plugin-stronghold";
import { storage } from "./Storage";

/** Token 数据定义 */
export interface TokenPayload {
    accessToken: string;
    refreshToken: string;
    accessExpiresAt: number;
    refreshExpiresAt?: number;
}

/** 存储后端类型 */
export type StorageBackend = "store" | "stronghold";

// 常量配置
const CONF = {
    // Tauri Store 配置
    STORE_FILE: "auth.json",
    // Stronghold 配置
    VAULT: "auth.hold",
    CLIENT: "auth_client",
    // 通用配置
    KEY: "auth_token",
    PASS: "vault-password-placeholder", // ⚠️ 生产环境请替换为安全的派生密码
    THRESHOLD: 5 * 60 * 1000, // 5分钟缓冲
};

/** 存储适配器接口 */
interface StorageAdapter {
    get(): Promise<TokenPayload | null>;
    set(payload: TokenPayload): Promise<void>;
    clear(): Promise<void>;
}

/** Tauri Store 适配器 (快速，推荐) */
class TauriStoreAdapter implements StorageAdapter {
    private store: Store | null = null;

    private async getStore(): Promise<Store> {
        if (this.store) return this.store;
        const userId = storage.get("userId");
        const path = await join(await appDataDir(), "users", userId, CONF.STORE_FILE);
        this.store = await loadStore(path, { autoSave: true });
        return this.store;
    }

    async get(): Promise<TokenPayload | null> {
        const store = await this.getStore();
        return await store.get<TokenPayload>(CONF.KEY) ?? null;
    }

    async set(payload: TokenPayload): Promise<void> {
        const store = await this.getStore();
        await store.set(CONF.KEY, payload);
    }

    async clear(): Promise<void> {
        const store = await this.getStore();
        await store.delete(CONF.KEY);
    }
}

/** Stronghold 适配器 (安全加密，初始化较慢) */
class StrongholdAdapter implements StorageAdapter {
    private ctx: { sh: Stronghold; client: Client } | null = null;

    private async getContext() {
        if (this.ctx) return this.ctx;
        const userId = storage.get("userId");
        const path = await join(await appDataDir(), "users", userId, CONF.VAULT);
        const sh = await Stronghold.load(path, CONF.PASS);

        let client: Client;
        try {
            client = await sh.loadClient(CONF.CLIENT);
        } catch {
            client = await sh.createClient(CONF.CLIENT);
        }

        this.ctx = { sh, client };
        return this.ctx;
    }

    private async withStore(fn: (store: StrongholdStore) => Promise<void>) {
        const { sh, client } = await this.getContext();
        await fn(client.getStore());
        await sh.save();
    }

    async get(): Promise<TokenPayload | null> {
        const { client } = await this.getContext();
        const data = await client.getStore().get(CONF.KEY);
        if (!data || data.length === 0) return null;

        try {
            const json = new TextDecoder().decode(new Uint8Array(data));
            return JSON.parse(json);
        } catch {
            return null;
        }
    }

    async set(payload: TokenPayload): Promise<void> {
        const data = Array.from(new TextEncoder().encode(JSON.stringify(payload)));
        await this.withStore(store => store.insert(CONF.KEY, data));
    }

    async clear(): Promise<void> {
        try {
            const { client, sh } = await this.getContext();
            await client.getStore().remove(CONF.KEY);
            await sh.save();
        } catch { /* 忽略 key 不存在的错误 */ }
    }
}

class TokenManager {
    // 内存缓存，减少 IO
    private mem: TokenPayload | null = null;
    // 存储适配器
    private adapter: StorageAdapter;
    // 当前后端类型
    private backend: StorageBackend;

    constructor(backend: StorageBackend = "store") {
        this.backend = backend;
        this.adapter = backend === "stronghold"
            ? new StrongholdAdapter()
            : new TauriStoreAdapter();
    }

    /** 切换存储后端 */
    switchBackend(backend: StorageBackend) {
        if (this.backend === backend) return;
        this.backend = backend;
        this.adapter = backend === "stronghold"
            ? new StrongholdAdapter()
            : new TauriStoreAdapter();
        // 清空内存缓存，下次读取时从新后端加载
        this.mem = null;
    }

    /** 获取当前后端类型 */
    getBackend(): StorageBackend {
        return this.backend;
    }

    /** 存储 Token */
    async set(payload: TokenPayload) {
        this.mem = payload;
        await this.adapter.set(payload);
    }

    /** 获取 Token (优先读内存，无内存读磁盘) */
    async get(): Promise<TokenPayload | null> {
        if (this.mem) return this.mem;
        this.mem = await this.adapter.get();
        return this.mem;
    }

    /** 获取有效 AccessToken (自动检查过期) */
    async getAccess(): Promise<string | null> {
        const t = await this.get();
        if (!t?.accessToken) return null;
        return Date.now() < (t.accessExpiresAt - CONF.THRESHOLD) ? t.accessToken : null;
    }

    /** 获取有效 Token (同步，仅从内存) */
    getAccessTokenSync(): string | null {
        if (this.mem) {
            const t = this.mem;
            if (!t?.accessToken) return null;
            return Date.now() < (t.accessExpiresAt - CONF.THRESHOLD) ? t.accessToken : null;
        }
        return null;
    }

    /** 获取有效 RefreshToken */
    async getRefresh(): Promise<string | null> {
        const t = await this.get();
        if (!t?.refreshToken) return null;
        return (!t.refreshExpiresAt || Date.now() < t.refreshExpiresAt) ? t.refreshToken : null;
    }

    /** 获取有效 RefreshToken (同步，仅从内存) */
    getRefreshTokenSync(): string | null {
        return this.mem?.refreshToken || null;
    }

    /** 清空 Token */
    async clear() {
        this.mem = null;
        await this.adapter.clear();
    }
}

// 默认使用 Tauri Store（快速），如需安全加密可传入 "stronghold"
export const tokenManager = new TokenManager("store");
export default tokenManager;