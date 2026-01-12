<template>
  <div class="file-upload">
    <div class="file-select">
      <span class="file-select-button" @click="$refs.fileInput.click()">Choose File</span>
      <div class="file-select-name">{{ fileName }}</div>
      <input ref="fileInput" type="file">
    </div>
    <button class="file-upload-button" @click.prevent="uploadFile">Send</button>
  </div>
</template>

<script>
export default {
  data() {
    return {
      file: null,
      fileName: "No file selected"
    };
  },
  methods: {
    onFileChange(event) {
      this.file = event.target.files[0];
      this.fileName = this.file ? this.file.name : "No file selected";
    },
    uploadFile() {
      // Upload file to server
    }
  }
};
</script>

<style scoped>
.file-upload {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px;
  border: 1px solid #ccc;
  border-radius: 5px;
}

.file-select {
  display: flex;
  align-items: center;
  flex: 1;
}

.file-select-button {
  font-size: 14px;
  padding: 5px 10px;
  color: #fff;
  background-color: #0088cc;
  border-radius: 5px;
  cursor: pointer;
}

.file-select-name {
  margin-left: 10px;
  font-size: 14px;
  color: #555;
}

.file-upload-button {
  margin-left: 10px;
  font-size: 14px;
  padding: 5px 10px;
  color: #fff;
  background-color: #0088cc;
  border: none;
  border-radius: 5px;
  cursor: pointer;
}

.file-upload-button:hover {
  background-color: #006699;
}
</style>