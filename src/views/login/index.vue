<template>
  <div class="login-head">
    <el-row style="height: 30px">
      <el-col :span="20" data-tauri-drag-region></el-col>
      <el-col :span="4">
        <system :maxVisible="false" about-visible />
      </el-col>
    </el-row>
  </div>

  <div class="login-control no-select">
    <div class="login-control-form">
      <div v-show="loginType != 'scan'" class="login-control-avatar">
        <img :src="defaultImg" class="avatar" />
      </div>

      <!-- 用户名登录表单 -->
      <el-form v-if="loginType === 'form'" ref="loginForms" v-model="loginForm" label-position="top" label-width="60px">
        <el-form-item :label="$t('pages.login.form.username')" prop="userId">
          <el-input v-model="loginForm.principal" :placeholder="$t('pages.login.placeholder.username')" type="text"></el-input>
        </el-form-item>
        <el-form-item :label="$t('pages.login.form.password')" prop="password">
          <el-input v-model="loginForm.credentials" :placeholder="$t('pages.login.placeholder.password')" show-password
            type="password" @keyup.enter.native="login"></el-input>
        </el-form-item>

        <a href="#" style="float: right" @click.prevent="selectForm('sms')">{{ $t("pages.login.methods.phone") }}</a>
        <!-- <a style="float: right; margin-right: 10px;" href="#" @click.prevent="selectForm('scan')">扫码登录</a> -->

        <br />
        <el-button :loading="loginLoading" class="login-button" type="primary" @click.prevent="login()">{{
          $t("pages.login.title") }}
        </el-button>
      </el-form>

      <!-- 手机登录表单 -->
      <el-form v-if="loginType === 'sms'" ref="loginForms" v-model="loginForm" label-position="top" label-width="60px">
        <el-form-item :label="$t('pages.login.form.phoneNumber')" prop="principal">
          <el-input v-model="loginForm.principal" :placeholder="$t('pages.login.placeholder.phoneNumber')" type="text"></el-input>
        </el-form-item>
        <el-form-item :label="$t('pages.login.form.code')" prop="credentials">
          <el-input v-model="loginForm.credentials" :placeholder="$t('pages.login.placeholder.code')" type="text"
            @keyup.enter.native="login">
            <template #append>
              <el-button :disabled="isDisabled" :style="`color: var(--el-color-primary)`" type="primary"
                @click.prevent="sendSmsCode">
                {{ buttonText }}
              </el-button>
            </template>
          </el-input>
        </el-form-item>

        <a href="#" style="float: right" @click.prevent="selectForm('form')">{{ $t("pages.login.methods.account") }}</a>
        <br />
        <el-button :loading="loginLoading" class="login-button" type="primary" @click="login()">{{ $t("pages.login.title") }}
        </el-button>
      </el-form>

      <!-- 扫码登录表单 -->
      <el-form v-if="loginType === 'scan'" ref="loginForms" label-position="top">
        <el-form-item prop="scan">
          <div style="margin: 0 auto; margin-bottom: 20px; font-size: 16px">{{ $t("pages.login.methods.qrcode") }}</div>
          <div class="qr-code">
            <img v-if="qrCodeUrl" :alt="$t('pages.login.qrcode.loading')" :src="qrCodeUrl" class="lazy-img" />
            <span v-else>{{ $t("pages.login.qrcode.loading") }}</span>
          </div>
        </el-form-item>

        <a href="#" style="float: right" @click.prevent="selectForm('form')">{{ $t("pages.login.methods.account") }}</a>
        <br />
      </el-form>
    </div>
    <!-- 优化后的SVG图标 -->
    <div v-show="loginType != 'scan'" class="login-svg-container">
      <svg-icon :name="'qrcode'" :size="'2em'" class="login-svg" @click="selectForm('scan')" />
    </div>
  </div>
</template>

<script lang="ts" setup>
import api from "@/api";
import defaultImg from '@/assets/img/icon1.png';
import svgIcon from "@/components/SvgIcon/index.vue";
import system from "@/components/System/index.vue";
import { useUserStore } from "@/store/modules/user";
import RSA from "@/utils/Auth";
import { ElMessage } from "element-plus";

const { t } = useI18n();

// RSA 加密实例（单例复用）
const rsa = new RSA();
const userStore = useUserStore();

// 登录方式，默认是用户名登录
const loginType = ref<"form" | "sms" | "scan">("form");

// 登录按钮加载
const loginLoading = ref(false);

// 公钥是否已初始化
const isPublicKeyReady = ref(false);

// 登录窗口初始化 - 获取公钥
const initPublicKey = async (): Promise<boolean> => {
  try {
    const res: any = await api.GetPublicKey();
    if (res?.publicKey) {
      rsa.setPublicKey(res.publicKey);
      isPublicKeyReady.value = true;
      return true;
    }
    console.warn("获取公钥失败：响应数据无效");
    return false;
  } catch (error) {
    console.error("获取公钥失败：", error);
    ElMessage.error(t("pages.login.messages.failed") || "初始化失败，请刷新重试");
    return false;
  }
};

// 登录表单数据
const loginForm = ref({
  principal: "100001",
  credentials: "123456"
});

// 倒计时按钮文本和状态
const buttonText = ref(t("pages.login.buttons.sendCode"));
const isDisabled = ref(false);
const smsTimerId = ref<ReturnType<typeof setInterval> | null>(null);

// 扫码相关状态
const qrCodeUrl = ref("");
const qrCode = ref("");
const qrCodeExpireAt = ref<number>(0);
const scanIntervalId = ref<ReturnType<typeof setInterval> | null>(null);

// 清理短信倒计时定时器
const clearSmsTimer = () => {
  if (smsTimerId.value) {
    clearInterval(smsTimerId.value);
    smsTimerId.value = null;
  }
};

// 清理二维码轮询定时器
const clearScanInterval = () => {
  if (scanIntervalId.value) {
    clearInterval(scanIntervalId.value);
    scanIntervalId.value = null;
  }
};

// 清理用户信息
const clearUserInfo = () => {
  loginForm.value.principal = "";
  loginForm.value.credentials = "";
};

// 发送验证码的倒计时逻辑
const startSmsCountdown = () => {
  clearSmsTimer();
  let count = 60;
  isDisabled.value = true;
  buttonText.value = `${count}s`;

  smsTimerId.value = setInterval(() => {
    count--;
    buttonText.value = `${count}s`;
    if (count <= 0) {
      clearSmsTimer();
      buttonText.value = t("pages.login.buttons.sendCode");
      isDisabled.value = false;
    }
  }, 1000);
};

// 切换登录方式
const selectForm = (type: "form" | "sms" | "scan") => {
  // 切换时清理之前的定时器
  if (loginType.value === "scan") {
    clearScanInterval();
  }

  loginType.value = type;
  loginForm.value.credentials = "";
  loginForm.value.principal = "";

  if (type === "scan") {
    requestQRCode();
  }
};

// 表单验证
const validateForm = (): boolean => {
  const { principal, credentials } = loginForm.value;

  if (!principal.trim()) {
    ElMessage.warning(loginType.value === "sms" ? t("pages.login.placeholder.phoneNumber") : t("pages.login.placeholder.username"));
    return false;
  }

  if (!credentials.trim()) {
    ElMessage.warning(loginType.value === "sms" ? t("pages.login.placeholder.code") : t("pages.login.placeholder.password"));
    return false;
  }

  // 手机号格式验证
  if (loginType.value === "sms" && !/^1[3-9]\d{9}$/.test(principal.trim())) {
    ElMessage.warning(t("login.phoneFormatError") || "手机号格式不正确");
    return false;
  }

  return true;
};

// 登录函数
const login = async () => {
  if (!validateForm()) return;

  // 确保公钥已初始化
  if (!isPublicKeyReady.value) {
    const success = await initPublicKey();
    if (!success) {
      ElMessage.error(t("pages.login.messages.failed") || "初始化失败，请重试");
      return;
    }
  }

  const password = rsa.rsaPublicData(loginForm.value.credentials.trim());
  if (!password) {
    // 加密失败，重新获取公钥
    ElMessage.warning(t("pages.login.messages.failed") || "加密失败，正在重试...");
    isPublicKeyReady.value = false;
    const success = await initPublicKey();
    if (!success) return;

    // 重新加密
    const retryPassword = rsa.rsaPublicData(loginForm.value.credentials.trim());
    if (!retryPassword) {
      ElMessage.error(t("pages.login.messages.failed") || "加密失败，请刷新页面重试");
      return;
    }
  }

  loginLoading.value = true;

  try {
    const formData = {
      principal: loginForm.value.principal.trim(),
      credentials: password || rsa.rsaPublicData(loginForm.value.credentials.trim()),
      authType: loginType.value
    };
    await userStore.login(formData);
  } catch (error: any) {
    // 错误已在 store 中处理
    console.error("登录失败：", error);
  } finally {
    loginLoading.value = false;
  }
};

// 发送短信验证码
const sendSmsCode = async () => {
  const phone = loginForm.value.principal.trim();

  if (!phone) {
    ElMessage.warning(t("pages.login.placeholder.phoneNumber"));
    return;
  }

  if (!/^1[3-9]\d{9}$/.test(phone)) {
    ElMessage.warning(t("login.phoneFormatError") || "手机号格式不正确");
    return;
  }

  try {
    await api.Sms({ phone });
    ElMessage.success(t("pages.login.messages.success") || "验证码已发送");
    startSmsCountdown();
  } catch (error) {
    console.error("发送验证码失败：", error);
    ElMessage.error(t("pages.login.messages.codeSendFailed") || "发送验证码失败");
  }
};

// 生成二维码唯一标识
const generateQRCodeId = (): string => {
  return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 10)}`;
};

// 获取二维码
const requestQRCode = async () => {
  clearScanInterval();
  qrCodeUrl.value = "";

  try {
    qrCode.value = generateQRCodeId();
    const result: any = await api.GetQRCode({ qrCode: qrCode.value });

    if (result?.imageBase64) {
      qrCodeUrl.value = result.imageBase64;
      qrCodeExpireAt.value = result.expireAt || (Date.now() + 180000); // 默认3分钟过期
      startQRCodePolling(qrCode.value);
    } else {
      ElMessage.error(t("pages.login.qrcode.error"));
    }
  } catch (error) {
    console.error("获取二维码失败：", error);
    ElMessage.error(t("pages.login.qrcode.error"));
  }
};

// 开始轮询检查二维码状态
const startQRCodePolling = (code: string) => {
  clearScanInterval();

  scanIntervalId.value = setInterval(async () => {
    // 检查是否超时（3分钟）
    if (Date.now() > qrCodeExpireAt.value) {
      clearScanInterval();
      ElMessage.warning(t("login.qrcodeExpired"));
      requestQRCode();
      return;
    }

    try {
      const result: any = await api.CheckQRCodeStatus({ qrCode: code });

      if (!result || result.code !== code) return;

      switch (result.status) {
        case "EXPIRED":
          clearScanInterval();
          ElMessage.warning(t("pages.login.qrcode.expired"));
          requestQRCode();
          break;

        case "SCANNED":
          // 已扫码，等待授权，可以更新UI提示
          break;

        case "AUTHORIZED":
          clearScanInterval();
          // 使用后台传过来的临时密码登录
          const formData = {
            principal: code,
            credentials: result.extra?.password,
            authType: loginType.value
          };

          if (!formData.credentials) {
            ElMessage.error(t("pages.login.messages.failed") || "授权信息无效");
            requestQRCode();
            return;
          }

          try {
            await userStore.login(formData);
          } catch (error) {
            console.error("扫码登录失败：", error);
          }
          break;
      }
    } catch (error) {
      console.error("检查二维码状态失败：", error);
      // 网络错误不中断轮询，继续尝试
    }
  }, 3000);
};

onMounted(() => {
  clearUserInfo();
  initPublicKey();
});

onUnmounted(() => {
  // 清理所有定时器
  clearSmsTimer();
  clearScanInterval();
});
</script>

<style lang="scss" scoped>
.login-head {
  // border-bottom: 1px solid var(--header-border-bottom-color);
  background-color: var(--header-bg-color);
}

.login-control {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100vh;
  background-color: var(--content-bg-color);
}

.login-control-form {
  padding-top: 10px;
  display: flex;
  flex-direction: column;
  justify-content: start;
  align-items: center;
}

.login-button {
  border-radius: 5px;
  width: 200px;
  height: 35px;
  margin: 0 auto;
  display: block;
}

.el-form-item__label {
  justify-content: flex-start !important;
}

.el-form-item {
  width: 230px;
}

.avatar {
  position: relative;
  width: 70px;
  height: 70px;
  background-color: transparent;
  border-radius: 5px;
  border: transparent;
  margin: 5px;
}

a {
  color: #1677ff;
  text-decoration: none;
  background-color: transparent;
  font-size: 14px;
  outline: none;
  cursor: pointer;
  margin-bottom: 15px;
  transition: color 0.3s;
}

.qr-code {
  margin-top: 10px;
  width: 200px;
  height: 200px;
  margin: 0 auto;

  img {
    width: 100%;
    height: 100%;
  }
}

/* 新增样式让SVG图标靠右 */
.login-svg-container {
  position: relative;
}

.login-svg {
  margin-top: 7px;
  margin-right: 5px;
  float: right;
  transform: rotateX(180deg);
  cursor: pointer;
}

.send-code-button {
  color: var(--el-color-primary);
}
</style>
