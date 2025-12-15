<template>
  <div class="profile-container">
    <!-- 表单部分 -->
    <el-form :model="profileForm" class="profile-form" label-width="80px">
      <el-row :gutter="20" align="middle">
        <el-col :span="6">
          <div class="avatar-section">
            <el-upload
              ref="uploadRef"
              :before-upload="handleFileChange"
              :on-success="handleAvatarSuccess"
              :show-file-list="false"
              accept="image/*"
              class="avatar-uploader"
            >
              <div class="avatar-wrap">
                <!-- 统一使用封装的头像组件 -->
                <div class="avatar-img">
                  <Avatar
                    :avatar="userAvatar"
                    :name="profileForm.name || userStore.userInfo?.name"
                    :width="100"
                    :borderRadius="8"
                  />
                  <!-- 覆盖层图标：在 avatar 上方显示 -->
                  <div class="avatar-mask" title="更换头像">
                    <!-- 如果你使用 Element Plus 图标组件（推荐），请在 script 中 import 并用 <el-icon> 包裹 -->
                    <el-icon class="camera-icon">
                      <Camera />
                    </el-icon>
                    <!-- 或者用字体图标：<i class="iconfont icon-camera" /> -->
                  </div>
                </div>
              </div>
            </el-upload>
          </div>
        </el-col>

        <el-col :span="18">
          <el-form-item :label="$t('settings.profile.nickname')">
            <el-input v-model="profileForm.name" :placeholder="$t('settings.profile.enterNickname')" />
          </el-form-item>

          <el-form-item :label="$t('settings.profile.birthday')">
            <el-date-picker
              v-model="profileForm.birthday"
              :clearable="true"
              date-format="yyyy-MM-dd"
              :placeholder="$t('settings.profile.selectBirthday')"
              placement="bottom-start"
              type="date"
            />
          </el-form-item>

          <el-form-item :label="$t('settings.profile.sex.label')">
            <el-radio-group v-model="profileForm.gender">
              <el-radio :label="1">{{ $t("settings.profile.sex.male") }}</el-radio>
              <el-radio :label="0">{{ $t("settings.profile.sex.female") }}</el-radio>
            </el-radio-group>
          </el-form-item>
        </el-col>
      </el-row>

      <el-row :gutter="20" align="middle">
        <el-col :span="24">
          <el-form-item :label="$t('settings.profile.address')">
            <el-input v-model="profileForm.location" :placeholder="$t('settings.profile.enterAddress')" />
          </el-form-item>

          <el-form-item :label="$t('settings.profile.mobile')">
            <el-input v-model="profileForm.phone" :placeholder="$t('settings.profile.enterMobile')" />
          </el-form-item>

          <el-form-item :label="$t('settings.profile.signature')">
            <el-input
              v-model="profileForm.selfSignature"
              :placeholder="$t('settings.profile.enterSignature')"
              :rows="2"
              resize="none"
              type="textarea"
            />
          </el-form-item>
        </el-col>

        <!-- 操作按钮 -->
        <el-col :span="24" class="actions">
          <el-button type="primary" @click="handleSubmit">{{ $t("profile.save") }} </el-button>
        </el-col>
      </el-row>

      <!-- <el-form-item>
                <el-button type="primary" @click="handleSubmit">保存修改</el-button>
            </el-form-item> -->
    </el-form>
  </div>
</template>

<script lang="ts" setup>
  import { useUserStore } from "@/store/modules/user";
  import { ElMessage } from "element-plus";
  import { Camera } from "@element-plus/icons-vue";
  import Avatar from "@/components/Avatar/index.vue";

  const userStore = useUserStore();
  const userAvatar = ref("");
  const uploadRef = ref();

  // 表单数据
  const profileForm = ref({
    name: "",
    gender: 1,
    birthday: "",
    location: "",
    phone: "",
    selfSignature: ""
  });

  const handleAvatarSuccess = () => {
    uploadRef.value.submit();
  };

  // 上传文件
  const handleFileChange = async (file: File) => {
    if (file.size > 1024 * 1024 * 2) {
      ElMessage.error("上传头像图片大小不能超过 2MB");
      return false;
    }
    if (file.type.indexOf("image") === -1) {
      ElMessage.error("请上传图片");
      return false;
    }
    userAvatar.value = URL.createObjectURL(file);
    if (file) {
      const { path } = await userStore.uploadUserAvatar(file);
      userAvatar.value = path;
    }
    return false;
  };

  // 提交表单
  const handleSubmit = async () => {
    try {
      // 更新用户信息
      await userStore.updateUserInfo({
        ...profileForm.value,
        avatar: userAvatar.value || userStore.userInfo.avatar
      });
      ElMessage.success("个人信息更新成功");
    } catch (error) {
      ElMessage.error("更新失败，请重试");
    }
  };

  const init = () => {
    profileForm.value = Object.assign({}, userStore.userInfo);
    userAvatar.value = userStore.userInfo.avatar as string;
  };

  // 初始化表单数据
  onMounted(() => {
    init();
  });
</script>

<style lang="scss" scoped>
  .profile-container {
    padding: 15px 5px;

    .avatar-section {
      text-align: center;
      margin-bottom: 8px;

      .el-avatar {
        cursor: pointer;
      }
    }

    .profile-form {
      max-width: 500px;
      margin: 0 auto;
    }

    .avatar-wrap {
      position: relative;
      width: 100px;
      height: 100px;
      display: inline-block;
      padding-left: 25px;
    }
    .avatar-img {
      position: absolute;
      width: 100%;
      border-radius: 8px;
      overflow: hidden;
    }

    .avatar-wrap {
      position: relative;
      width: 100px;
      height: 100px;
      border-radius: 8px; /* 保持和 Avatar 组件一致的圆角 */
      overflow: hidden; /* 确保蒙层不溢出 */

      /* 鼠标悬停时触发蒙层显示 */
      &:hover .avatar-mask {
        opacity: 1;
      }
    }

    /* 蒙层样式设计 */
    .avatar-mask {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0, 0, 0, 0.6); /* 黑色半透明背景 */
      backdrop-filter: blur(1px); /* 可选：轻微的高斯模糊效果 */
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: #fff;
      opacity: 0; /* 默认隐藏 */
      transition: all 0.3s ease; /* 丝滑过渡动画 */
      z-index: 10;

      .camera-icon {
        font-size: 20px;
        margin-bottom: 2px;
        margin-right: 26px;
      }
    }
  }
</style>
