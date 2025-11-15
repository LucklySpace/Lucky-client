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
        <Avatar :avatar="defaultImg" :name="$t('login.label')" :width="64" :borderRadius="6" class="avatar" />
      </div>

      <!-- 用户名登录表单 -->
      <el-form v-if="loginType === 'form'" ref="loginForms" v-model="loginForm" label-position="top" label-width="60px">
        <el-form-item :label="$t('login.username')" prop="userId">
          <el-input v-model="loginForm.principal" :placeholder="$t('login.inputUsername')" type="text"></el-input>
        </el-form-item>
        <el-form-item :label="$t('login.password')" prop="password">
          <el-input
            v-model="loginForm.credentials"
            :placeholder="$t('login.inputPassword')"
            show-password
            type="password"
            @keyup.enter.native="login"
          ></el-input>
        </el-form-item>

        <a href="#" style="float: right" @click.prevent="selectForm('sms')">{{ $t("login.phone") }}</a>
        <!-- <a style="float: right; margin-right: 10px;" href="#" @click.prevent="selectForm('scan')">扫码登录</a> -->

        <br />
        <el-button :loading="loginLoading" class="login-button" type="primary" @click.prevent="login()"
          >{{ $t("login.label") }}
        </el-button>
      </el-form>

      <!-- 手机登录表单 -->
      <el-form v-if="loginType === 'sms'" ref="loginForms" v-model="loginForm" label-position="top" label-width="60px">
        <el-form-item :label="$t('login.phoneNumber')" prop="principal">
          <el-input v-model="loginForm.principal" :placeholder="$t('login.inputPhoneNumber')" type="text"></el-input>
        </el-form-item>
        <el-form-item :label="$t('login.code')" prop="credentials">
          <el-input
            v-model="loginForm.credentials"
            :placeholder="$t('login.inputCode')"
            type="text"
            @keyup.enter.native="login"
          >
            <template #append>
              <el-button
                :disabled="isDisabled"
                :style="`color: var(--el-color-primary)`"
                type="primary"
                @click.prevent="sendSmsCode"
              >
                {{ buttonText }}
              </el-button>
            </template>
          </el-input>
        </el-form-item>

        <a href="#" style="float: right" @click.prevent="selectForm('form')">{{ $t("login.account") }}</a>
        <br />
        <el-button :loading="loginLoading" class="login-button" type="primary" @click="login()"
          >{{ $t("login.label") }}
        </el-button>
      </el-form>

      <!-- 扫码登录表单 -->
      <el-form v-if="loginType === 'scan'" ref="loginForms" label-position="top">
        <el-form-item prop="scan">
          <div style="margin: 0 auto; margin-bottom: 20px; font-size: 16px">{{ $t("login.scan") }}</div>
          <div class="qr-code">
            <img v-if="qrCodeUrl" :alt="$t('login.qrcode')" :src="qrCodeUrl" class="lazy-img" />
            <span v-else>{{ $t("login.loadingQR") }}</span>
          </div>
        </el-form-item>

        <a href="#" style="float: right" @click.prevent="selectForm('form')">{{ $t("login.account") }}</a>
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
  import svgIcon from "@/components/SvgIcon/index.vue";
  import system from "@/components/System/index.vue";
  import Avatar from "@/components/Avatar/index.vue";
  import { ElMessage } from "element-plus";
  import { useUserStore } from "@/store/modules/user";
  import api from "@/api";
  import RSA from "@/utils/Auth";
  import { useMainManager } from "@/core";
  import defaultImg from '@/assets/img/icon1.png';

  const { t } = useI18n();

  const rsa = new RSA();
  const userStore = useUserStore();
  // const inst = getCurrentInstance()!;

  // console.log("当前 locale:", inst.appContext.config.globalProperties.$i18n.locale);
  // console.log("可用 locales:", inst.appContext.config.globalProperties.$i18n.availableLocales);
  //console.log("en-US messages:", inst.appContext.config.globalProperties.$i18n.getLocaleMessage("en-US"));

  // 登录方式，默认是用户名登录
  const loginType = ref<"form" | "sms" | "scan">("form");

  // 登录按钮加载
  const loginLoading = ref(false);

  // 登录窗口初始化
  const init = async () => {
    // 初始化数据库
    useMainManager().initDatabase();

    // 登录时 移除 token 和  userId
    // storage.remove("token");
    // storage.remove("userId");

    // 初始化公钥
    const res: any = await api.GetPublicKey();
    rsa.setPublicKey(res.publicKey);
  };

  // 登录表单数据
  const loginForm = ref({
    principal: "100001",
    credentials: "123456"
  });

  // 倒计时按钮文本和状态
  const buttonText = ref(t("login.sendCode"));
  const isDisabled = ref(false);
  let timer: any = null;

  // 扫码相关状态
  const qrCodeUrl = ref("");
  const qrCode = ref("");
  let requestTimer: any = ref(null);
  let scanInterval: any = ref(null);

  // 发送验证码的倒计时逻辑
  const startTimer = () => {
    let count = 60;
    isDisabled.value = true;
    buttonText.value = `${count}s`;
    timer = setInterval(() => {
      count--;
      buttonText.value = `${count}s`;
      if (count === 0) {
        clearInterval(timer);
        buttonText.value = t("login.sendCode");
        isDisabled.value = false;
      }
    }, 1000);
  };

  // 切换登录方式
  const selectForm = (type: string) => {
    (loginType.value as any) = type;
    loginForm.value.credentials = "";
    loginForm.value.principal = "";
    if (type === "scan") {
      requestQRCode(); // 进入扫码登录时自动请求二维码
    } else {
      clearInterval(scanInterval.value); // 清除扫码轮询
    }
  };

  // 登录函数
  const login = async () => {
    if (loginForm.value.principal === "" || loginForm.value.credentials === "") {
      ElMessage.error(t("login.accountNull"));
      return;
    }
    const password = rsa.rsaPublicData(loginForm.value.credentials);
    if (password) {
      loginLoading.value = true;

      let formData = {
        principal: loginForm.value.principal,
        credentials: password,
        authType: loginType.value
      };
      userStore
        .login(formData)
        .then(res => {
          loginLoading.value = false;
        })
        .catch(err => {
          loginLoading.value = false;
        });
    } else {
      init();
    }
  };

  // 发送短信验证码
  const sendSmsCode = async () => {
    if (loginForm.value.principal !== "") {
      api
        .Sms({ phone: loginForm.value.principal })
        .then((res: any) => {})
        .catch((err: any) => {
          ElMessage.error(t("login.qrcodeError"));
        });
      startTimer(); // 开始倒计时
    }
  };

  // 获取二维码
  const requestQRCode = async () => {
    // 生成UUID作为二维码标识
    qrCode.value = Math.random().toString(36).substring(2);

    // 调用接口获取二维码
    const result: any = await api.GetQRCode({ qrCode: qrCode.value });

    if (result) {
      qrCodeUrl.value = result.imageBase64;
      requestTimer.value = result.expireAt;
      checkQRCodeStatus(qrCode.value);
    } else {
      ElMessage.error(t("login.getQrcodeError"));
    }
  };

  // 轮训检查二维码状态
  const checkQRCodeStatus = async (qrCode: string) => {
    scanInterval.value = setInterval(async () => {
      // 调用接口检查二维码状态
      const result: any = await api.CheckQRCodeStatus({ qrCode });

      if (result && result.code === qrCode) {
        if (result && result.status == "EXPIRED") {
          clearInterval(scanInterval.value);
          ElMessage.error(t("login.qrcodeExpired"));
          requestQRCode();
        }
        // 扫码完成未授权
        if (result.status == "SCANNED") {
        }
        // 扫码完成已授权
        if (result.status == "AUTHORIZED") {
          clearInterval(scanInterval.value);
          // 获取登录结果,使用后台传过来的临时密码登录
          let formData = {
            principal: qrCode,
            credentials: result.extra.password,
            authType: loginType.value
          };
          await userStore.login(formData);
          //ElMessage.success(t("login.loginSuccess"));
        }
      }

      // 超过三分钟重新请求二维码
      if (new Date().getTime() - requestTimer.value > 1000 * 60 * 3) {
        clearInterval(scanInterval.value);
        ElMessage.error(t("login.qrcodeExpired"));
        requestQRCode();
      }
    }, 3000);
  };

  onMounted(() => {
    init();
  });

  onUnmounted(() => {
    clearInterval(scanInterval.value); // 清除扫码轮询
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
