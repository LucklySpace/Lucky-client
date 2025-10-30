// // 异常类型与序列化
// use serde::{Serialize, ser::Serializer};
// use thiserror::Error;

// // Tauri 核心
// use tauri::{command, Runtime, Window};

// // HTTP 客户端
// use reqwest::Client;

// // 异步文件与 I/O
// use tokio::{
//     fs::{metadata, OpenOptions},
//     io::{AsyncWriteExt, AsyncSeekExt, BufWriter},
// };
// use std::io::SeekFrom;

// // 流式读取响应体
// use futures_util::TryStreamExt;
// use tauri::Emitter;

// // 标准集合
// use std::collections::HashMap;

// type Result<T> = std::result::Result<T, Error>;

// impl Serialize for Error {
//     fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
//     where
//         S: Serializer,
//     {
//         serializer.serialize_str(self.to_string().as_ref())
//     }
// }

// #[derive(Clone, Serialize)]
// struct ProgressPayload {
//     id: u32,
//     progress: u64,
//     total: u64,
// }

// #[tauri::command]
// pub async fn file_download<R: Runtime>(
//     window: Window<R>,
//     id: u32,
//     url: &str,
//     file_path: &str,
//     mut headers: HashMap<String, String>,
// ) -> Result<u32> {
//     let client = reqwest::Client::new();

//     // Step 1: 获取本地文件大小（断点续传偏移量）
//     let offset = match tokio::fs::metadata(file_path).await {
//         Ok(meta) => meta.len(),
//         Err(_) => 0,
//     };

//     if offset > 0 {
//         headers.insert("Range".to_string(), format!("bytes={}-", offset));
//     }

//     let mut request = client.get(url);
//     for (key, value) in headers {
//         request = request.header(&key, value);
//     }

//     let response = request.send().await?;

//     let total = match response.content_length() {
//         Some(len) => offset + len,
//         None => offset,
//     };

//     // Step 2: 打开文件为“可写追加”模式 + seek 到 offset
//     let f = tokio::fs::OpenOptions::new()
//         .create(true)
//         .write(true)
//         .open(file_path)
//         .await?;
//     let mut file = BufWriter::new(f);
//     file.seek(SeekFrom::Start(offset)).await?;

//     // Step 3: 下载并写入剩余部分
//     let mut stream = response.bytes_stream();
//     let mut downloaded = offset;

//     while let Some(chunk) = stream.try_next().await? {
//         file.write_all(&chunk).await?;
//         downloaded += chunk.len() as u64;

//         let _ = window.emit(
//             "download://progress",
//             ProgressPayload {
//                 id,
//                 progress: downloaded,
//                 total,
//             },
//         );
//     }

//     file.flush().await?;
//     Ok(id)
// }
