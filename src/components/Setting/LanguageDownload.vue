<template>
  <el-dialog
    v-model="visible"
    :title="$t('pages.settings.general.language.download')"
    width="600px"
    :close-on-click-modal="false"
  >
    <div class="language-download-container">
      <!-- 加载状态 -->
      <div v-if="loading" class="loading-container">
        <el-icon class="is-loading">
          <loading />
        </el-icon>
        <span>{{ $t("common.status.loading") }}...</span>
      </div>

      <!-- 语言包列表 -->
      <div v-else class="language-list">
        <div
          v-for="lang in displayLanguages"
          :key="lang.locale"
          class="language-item"
          :class="{ installed: lang.isInstalled, downloading: lang.isDownloading }"
        >
          <div class="language-info">
            <div class="language-name">
              <span class="name">{{ lang.name }}</span>
              <el-tag v-if="lang.isInstalled" type="success" size="small">
                {{ $t("pages.settings.general.language.installed") }}
              </el-tag>
              <el-tag v-else-if="lang.hasUpdate" type="warning" size="small">
                {{ $t("pages.settings.general.language.updateAvailable") }}
              </el-tag>
            </div>
            <div class="language-meta">
              <span class="locale">{{ lang.locale }}</span>
              <span v-if="lang.version" class="version">v{{ lang.version }}</span>
              <span v-if="lang.author" class="author">by {{ lang.author }}</span>
            </div>
            <div v-if="lang.description" class="language-description">
              {{ lang.description }}
            </div>
          </div>

          <div class="language-actions">
            <!-- 下载中 -->
            <div v-if="lang.isDownloading" class="progress-container">
              <el-progress :percentage="lang.downloadProgress" :stroke-width="8" />
            </div>

            <!-- 已安装 -->
            <el-button
              v-else-if="lang.isInstalled && !lang.hasUpdate"
              size="small"
              type="info"
              plain
              disabled
            >
              {{ $t("pages.settings.general.language.installed") }}
            </el-button>

            <!-- 有更新 -->
            <el-button
              v-else-if="lang.hasUpdate"
              size="small"
              type="warning"
              @click="handleDownload(lang)"
            >
              {{ $t("common.actions.update") }}
            </el-button>

            <!-- 未安装 -->
            <el-button v-else size="small" type="primary" @click="handleDownload(lang)">
              {{ $t("common.actions.download") }}
            </el-button>
          </div>
        </div>

        <!-- 空状态 -->
        <el-empty v-if="displayLanguages.length === 0" :description="$t('common.status.noData')" />
      </div>
    </div>

    <template #footer>
      <el-button @click="visible = false">{{ $t("common.actions.cancel") }}</el-button>
      <el-button type="primary" @click="handleRefresh">
        <el-icon><refresh /></el-icon>
        {{ $t("common.actions.refresh") }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script lang="ts" setup>
  import { useI18n } from "@/i18n";
import { useLanguageManager, type LanguagePackMeta } from "@/i18n/LanguageManager";
import { Loading, Refresh } from "@element-plus/icons-vue";
import { ElMessage } from "element-plus";
import { computed, ref } from "vue";

  /**
   * 增强的语言包信息（包含 UI 状态）
   */
  interface LanguageItemUI extends LanguagePackMeta {
    isInstalled: boolean;
    hasUpdate: boolean;
    isDownloading: boolean;
    downloadProgress: number;
  }

  const visible = ref(false);
  const loading = ref(false);
  const availableLanguages = ref<LanguagePackMeta[]>([]);
  const installedLanguages = ref<LanguagePackMeta[]>([]);
  const downloadingLangs = ref<Set<string>>(new Set());
  const downloadProgress = ref<Record<string, number>>({});

  const languageManager = useLanguageManager();
  const { loadLocaleOptions, setLocale } = useI18n();

  /**
   * 合并可用语言和已安装语言，生成 UI 数据
   */
  const displayLanguages = computed<LanguageItemUI[]>(() => {
    const map = new Map<string, LanguageItemUI>();

    // 先添加所有可用语言
    for (const lang of availableLanguages.value) {
      map.set(lang.locale, {
        ...lang,
        isInstalled: false,
        hasUpdate: false,
        isDownloading: downloadingLangs.value.has(lang.locale),
        downloadProgress: downloadProgress.value[lang.locale] || 0
      });
    }

    // 标记已安装的语言
    for (const installed of installedLanguages.value) {
      const existing = map.get(installed.locale);
      if (existing) {
        existing.isInstalled = true;
        // 检查是否有更新
        if (
          installed.version &&
          existing.version &&
          compareVersion(installed.version, existing.version) < 0
        ) {
          existing.hasUpdate = true;
        }
      } else {
        // 仅本地安装的语言（不在远程列表中）
        map.set(installed.locale, {
          ...installed,
          isInstalled: true,
          hasUpdate: false,
          isDownloading: false,
          downloadProgress: 0,
          downloadUrl: ""
        });
      }
    }

    return Array.from(map.values()).sort((a, b) => {
      // 已安装的排在前面
      if (a.isInstalled && !b.isInstalled) return -1;
      if (!a.isInstalled && b.isInstalled) return 1;
      // 其次按名称排序
      return a.name.localeCompare(b.name);
    });
  });

  /**
   * 显示对话框
   */
  const showDialog = async () => {
    visible.value = true;
    await loadLanguageData();
  };

  /**
   * 加载语言数据
   */
  const loadLanguageData = async () => {
    loading.value = true;
    try {
      const [available, installed] = await Promise.all([
        languageManager.getAvailableLanguages(),
        languageManager.getInstalledLanguages()
      ]);

      availableLanguages.value = available;
      installedLanguages.value = installed;
    } catch (error) {
      ElMessage.error("加载语言列表失败");
      console.error(error);
    } finally {
      loading.value = false;
    }
  };

  /**
   * 下载语言包
   */
  const handleDownload = async (lang: LanguageItemUI) => {
    try {
      downloadingLangs.value.add(lang.locale);
      downloadProgress.value[lang.locale] = 0;

      const success = await languageManager.downloadLanguage(lang, (progress, total) => {
        const percent = total > 0 ? Math.round((progress / total) * 100) : 0;
        downloadProgress.value[lang.locale] = percent;
      });

      if (success) {
        ElMessage.success(`${lang.name} 下载成功`);
        // 重新加载语言选项和数据
        await Promise.all([loadLocaleOptions(), loadLanguageData()]);
      }
    } catch (error) {
      ElMessage.error(`${lang.name} 下载失败`);
      console.error(error);
    } finally {
      downloadingLangs.value.delete(lang.locale);
      delete downloadProgress.value[lang.locale];
    }
  };

  /**
   * 刷新语言列表
   */
  const handleRefresh = async () => {
    await loadLanguageData();
    ElMessage.success("刷新成功");
  };

  /**
   * 简单版本比较
   */
  const compareVersion = (v1: string, v2: string): number => {
    const parts1 = v1.split(".").map(Number);
    const parts2 = v2.split(".").map(Number);

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;

      if (p1 < p2) return -1;
      if (p1 > p2) return 1;
    }

    return 0;
  };

  defineExpose({
    showDialog
  });
</script>

<style lang="scss" scoped>
  .language-download-container {
    min-height: 300px;
    max-height: 500px;
    overflow-y: auto;
  }

  .loading-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 60px 20px;
    color: var(--el-text-color-secondary);

    .el-icon {
      font-size: 32px;
    }
  }

  .language-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .language-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px;
    border: 1px solid var(--el-border-color);
    border-radius: 8px;
    background-color: var(--el-fill-color-blank);
    transition: all 0.3s;

    &:hover {
      border-color: var(--el-color-primary);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    }

    &.installed {
      background-color: var(--el-fill-color-light);
    }

    &.downloading {
      opacity: 0.7;
      pointer-events: none;
    }
  }

  .language-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .language-name {
    display: flex;
    align-items: center;
    gap: 8px;

    .name {
      font-size: 16px;
      font-weight: 600;
      color: var(--el-text-color-primary);
    }
  }

  .language-meta {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 13px;
    color: var(--el-text-color-secondary);

    .locale {
      font-family: monospace;
      background-color: var(--el-fill-color);
      padding: 2px 6px;
      border-radius: 4px;
    }

    .version,
    .author {
      opacity: 0.8;
    }
  }

  .language-description {
    font-size: 13px;
    color: var(--el-text-color-regular);
    line-height: 1.5;
  }

  .language-actions {
    display: flex;
    align-items: center;
    margin-left: 16px;

    .progress-container {
      width: 120px;
    }
  }
</style>

