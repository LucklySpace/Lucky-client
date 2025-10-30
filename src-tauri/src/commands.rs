// use tauri::{Manager, ResourceId, Runtime, Webview};
// use tauri::image::JsImage;
// use tauri::tray::TrayIcon;
use crate::AppState;
use base64::{engine::general_purpose, Engine as _};
use enigo::Enigo;
use screenshots::Screen;
use serde::Serialize;
use tauri::image::Image;
use tauri::AppHandle;
use tauri::Emitter;
use tauri::State;
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_clipboard_manager::Error as ClipboardError;
use tauri_plugin_http::reqwest;

use std::{
    sync::atomic::{AtomicBool, Ordering},
    sync::Arc,
    thread,
    time::{Duration, Instant},
};

/**
 * https://docs.rs/screenshots/latest/screenshots/struct.Screen.html
 */

#[tauri::command]
pub fn clipboard_image(app: AppHandle, url: String) -> Result<(), ClipboardError> {
    // 直接用 ? 把 Image::from_path 和 write_image 的错误都向上传递
    let img = Image::from_path(url)?;
    app.clipboard().write_image(&img)?;
    Ok(())
}

#[tauri::command]
pub async fn url_to_rgba(url: String) -> Result<(u32, u32, Vec<u8>), String> {
    // 1. 下载图片二进制
    let resp = reqwest::get(&url)
        .await
        .map_err(|e| format!("request error: {}", e))?;
    let buf = resp
        .bytes()
        .await
        .map_err(|e| format!("bytes error: {}", e))?;

    // 2. 用 image crate 解析
    let dyn_img = image::load_from_memory(&buf)
        .map_err(|e| format!("decode error: {}", e))?
        .to_rgba8();

    let (width, height) = dyn_img.dimensions();
    let rgba = dyn_img.into_vec(); // Vec<u8>，每 4 个一组

    Ok((width, height, rgba))
}

/**
 * 根据URL图片地址缓存图片到本地
 * url： 图片地址
 * cache_base: tauri本地缓存目录
 *
 * 1. 根据图片名称生成hash名称
 * 2. 创建文件目录
 * 3. 判断文件是否存在 存在直接返回文件地址 否则 第4步
 * 4. 下载并缓存到本地 返回文件地址
 *
 */
#[tauri::command]
pub async fn cache_image_to_path(url: String, cache_base: String) -> Result<String, String> {
    use reqwest::Client;
    use sha2::{Digest, Sha256};
    use std::fs::{self, File};
    use std::io::Write;
    use std::path::PathBuf;

    let ext = url
        .rsplit('.')
        .next()
        .and_then(|s| s.split(&['?', '#'][..]).next())
        .filter(|s| s.len() <= 5)
        .unwrap_or("jpg");

    let mut hasher = Sha256::new();
    hasher.update(url.as_bytes());
    let filename = format!("{:x}.{}", hasher.finalize(), ext);

    let dir = PathBuf::from(cache_base);

    // ✅ 确保目录创建不会因权限或路径失败
    fs::create_dir_all(&dir).map_err(|e| format!("mkdir error: {}", e))?;

    let mut file_path = dir.clone();
    file_path.push(&filename);

    if file_path.exists() {
        return Ok(file_path.to_string_lossy().into_owned());
    }

    // ✅ 下载数据
    let bytes = Client::new()
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("request error: {}", e))?
        .bytes()
        .await
        .map_err(|e| format!("bytes error: {}", e))?;

    // ✅ 写入文件
    let mut file = File::create(&file_path).map_err(|e| format!("file create: {}", e))?;
    file.write_all(&bytes)
        .map_err(|e| format!("write error: {}", e))?;

    Ok(file_path.to_string_lossy().into_owned())
}

/**
 * 获取鼠标位置
 */
#[tauri::command]
pub fn get_mouse_position() -> (i32, i32) {
    let location = Enigo::mouse_location();
    (location.0 as i32, location.1 as i32)
}

#[tauri::command]
pub fn control_mouse_poller(
    app: AppHandle,
    state: State<'_, AppState>,
    start: bool,
    interval_ms: Option<u64>,
    window_label: Option<String>,
    min_move: Option<i32>,    // 新增：最小移动阈值（像素）
    throttle_ms: Option<u64>, // 新增：节流时间（毫秒），合并短时间内的多次变化
) -> Result<String, String> {
    // 获取 mutex guard
    let mut guard = state
        .mouse_poller
        .lock()
        .map_err(|e| format!("lock error: {}", e))?;

    if start {
        if guard.is_some() {
            println!("[mouse_poller] already running");
            return Ok("already running".into());
        }

        // stop flag 控制线程退出
        let stop_flag = Arc::new(AtomicBool::new(false));
        let stop_flag_thread = stop_flag.clone();

        // 轮询间隔（默认 80ms）
        let ms = interval_ms.unwrap_or(80);
        let interval = Duration::from_millis(ms);

        // 最小移动阈值（默认 0）
        let min_move_val = min_move.unwrap_or(0).max(0);

        // 节流间隔（None 或 0 表示不做节流）
        let throttle_val = throttle_ms.unwrap_or(0);

        let app_for_thread = app.clone();
        let target_label = window_label.clone();

        let handle = thread::spawn(move || {
            println!(
                "[mouse_poller] thread started (interval {}ms, min_move {}, throttle {}ms)",
                ms, min_move_val, throttle_val
            );

            // last_sent: 上一次真正发送出去的坐标（用于比较阈值）
            let mut last_sent: Option<(i32, i32)> = None;
            // pending: 在节流窗口内，最新的待发送坐标（会覆盖）
            let mut pending: Option<(i32, i32)> = None;
            // 上次发送时间
            let mut last_emit_time = Instant::now() - Duration::from_secs(3600); // 设为很久以前，首次可发送

            // 循环，直到 stop_flag 被置位
            while !stop_flag_thread.load(Ordering::Relaxed) {
                // 获取当前鼠标位置
                let (x, y) = Enigo::mouse_location();
                let cur = (x as i32, y as i32);

                // 判断是否和 last_sent 有足够移动
                let moved_enough = match last_sent {
                    Some((sx, sy)) => {
                        let dx = (cur.0 - sx).abs();
                        let dy = (cur.1 - sy).abs();
                        // 使用 L1 距离作为判定：abs(dx)+abs(dy) >= min_move
                        (dx + dy) >= min_move_val
                    }
                    None => {
                        // 如果还没发送过任何点，认为第一次移动应当发送（除非 min_move > 0 且在 (0,0)）
                        true
                    }
                };

                let now = Instant::now();

                if moved_enough {
                    if throttle_val == 0 {
                        // 不做节流：立即发送
                        let payload = MousePos { x: cur.0, y: cur.1 };
                        let res = if let Some(ref label) = target_label {
                            app_for_thread.emit_to(label.clone(), "mouse:position", payload)
                        } else {
                            app_for_thread.emit("mouse:position", payload)
                        };
                        if res.is_err() {
                            eprintln!("[mouse_poller] emit error: {:?}", res.err());
                        } else {
                            // 更新 last_sent 及 last_emit_time
                            last_sent = Some(cur);
                            last_emit_time = now;
                        }
                        // 清空 pending（已发送）
                        pending = None;
                    } else {
                        // 做节流：保存为 pending（覆盖），并在超过 throttle 时发送
                        pending = Some(cur);

                        // 若距离上次发送已超过 throttle，则发送 pending（最新）
                        if now.duration_since(last_emit_time).as_millis() as u64 >= throttle_val {
                            if let Some(p) = pending.take() {
                                let payload = MousePos { x: p.0, y: p.1 };
                                let res = if let Some(ref label) = target_label {
                                    app_for_thread.emit_to(label.clone(), "mouse:position", payload)
                                } else {
                                    app_for_thread.emit("mouse:position", payload)
                                };
                                if res.is_err() {
                                    eprintln!("[mouse_poller] emit error: {:?}", res.err());
                                } else {
                                    last_sent = Some(p);
                                    last_emit_time = Instant::now();
                                }
                            }
                        }
                    }
                } else {
                    // 没有足够移动：如果存在 pending（由先前较小移动产生），并且已超过 throttle，也可发送 pending
                    if throttle_val > 0 {
                        if let Some(_p) = pending {
                            if now.duration_since(last_emit_time).as_millis() as u64 >= throttle_val
                            {
                                if let Some(p) = pending.take() {
                                    let payload = MousePos { x: p.0, y: p.1 };
                                    let res = if let Some(ref label) = target_label {
                                        app_for_thread.emit_to(
                                            label.clone(),
                                            "mouse:position",
                                            payload,
                                        )
                                    } else {
                                        app_for_thread.emit("mouse:position", payload)
                                    };
                                    if res.is_err() {
                                        eprintln!("[mouse_poller] emit error: {:?}", res.err());
                                    } else {
                                        last_sent = Some(p);
                                        last_emit_time = Instant::now();
                                    }
                                }
                            }
                        }
                    }
                }

                // 睡眠到下一次轮询
                thread::sleep(interval);
            }

            // 线程退出前：若有未发送的 pending，则发送一次（确保不丢最后一条）
            if let Some(p) = pending {
                let payload = MousePos { x: p.0, y: p.1 };
                let res = if let Some(ref label) = target_label {
                    app_for_thread.emit_to(label.clone(), "mouse:position", payload)
                } else {
                    app_for_thread.emit("mouse:position", payload)
                };
                if res.is_err() {
                    eprintln!("[mouse_poller] emit error on shutdown: {:?}", res.err());
                } else {
                    println!(
                        "[mouse_poller] emitted pending on shutdown: ({},{})",
                        p.0, p.1
                    );
                }
            }

            println!("[mouse_poller] thread exiting");
        });

        // 存储 stop_flag 与 handle
        *guard = Some((stop_flag, handle));
        Ok("started".into())
    } else {
        // 停止：取出存储的 (flag, handle)
        match guard.take() {
            Some((flag, handle)) => {
                // 标记停止
                flag.store(true, Ordering::Relaxed);

                // 异步 join（避免阻塞主线程）
                std::thread::spawn(move || match handle.join() {
                    Ok(_) => println!("[mouse_poller] thread joined successfully"),
                    Err(e) => eprintln!("[mouse_poller] thread join error: {:?}", e),
                });

                Ok("stopping".into())
            }
            None => {
                println!("[mouse_poller] not running");
                Ok("not running".into())
            }
        }
    }
}

/**
 * 使用jieba 分词器进行分词
 */
#[tauri::command]
pub fn segment_text(state: State<'_, AppState>, text: String, exact: bool) -> Vec<String> {
    // 读取锁（短时间持有）
    let jieba = state.jieba.read().expect("RwLock poisoned");
    jieba
        .cut(&text, exact)
        .into_iter()
        .map(|s| s.to_string())
        .collect()
}

/// 批量分词，接受一个包含 (id, 文本) 元组的向量，返回 (id, 分词结果) 元组的向量
#[tauri::command]
pub fn batch_segment_text(
    state: State<'_, AppState>,
    inputs: Vec<(String, String)>,
    exact: bool,
) -> Vec<(String, Vec<String>)> {
    let jieba = state.jieba.read().expect("RwLock poisoned");
    inputs
        .into_iter()
        .map(|(id, text)| {
            let words = jieba.cut(&text, exact);
            (id, words.into_iter().map(|s| s.to_string()).collect())
        })
        .collect()
}
/**
 * 获取屏幕信息
 */
#[tauri::command]
pub fn get_display_info() -> Result<Vec<DisplayInfo>, String> {
    match Screen::all() {
        Ok(screens) => {
            let screen_infos = screens
                .iter()
                .map(|screen| {
                    let display_info = screen.display_info;
                    DisplayInfo {
                        id: display_info.id,
                        x: display_info.x,
                        y: display_info.y,
                        width: display_info.width,
                        height: display_info.height,
                        rotation: display_info.rotation,
                        scale_factor: display_info.scale_factor,
                        frequency: display_info.frequency,
                        is_primary: display_info.is_primary,
                    }
                })
                .collect();
            Ok(screen_infos)
        }
        Err(e) => Err(e.to_string()),
    }
}

/**
 * 截取所有屏幕
 */
#[tauri::command]
pub fn get_all_screens() -> Result<Vec<String>, String> {
    let screens = Screen::all().unwrap();
    let mut list = Vec::new();
    for screen in screens {
        let image = screen.capture().unwrap();
        let buffer = image.buffer();
        let base64_str = general_purpose::STANDARD_NO_PAD.encode(buffer);
        list.push(base64_str)
    }
    Ok(list)
}

/**
 * 截屏
 */
#[tauri::command]
pub fn screenshot(x: &str, y: &str, width: &str, height: &str) -> String {
    let screen = Screen::from_point(x.parse::<i32>().unwrap(), y.parse::<i32>().unwrap()).unwrap();
    let image = screen
        .capture_area(
            0,
            0,
            width.parse::<u32>().unwrap(),
            height.parse::<u32>().unwrap(),
        )
        .unwrap();
    let buffer = image.buffer();
    let base64_str = general_purpose::STANDARD_NO_PAD.encode(buffer);
    base64_str
}

#[derive(Serialize)]
pub struct DisplayInfo {
    id: u32,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    rotation: f32,
    scale_factor: f32,
    frequency: f32,
    is_primary: bool,
}

/// 鼠标坐标结构，公开以便序列化/使用
#[derive(Serialize, Debug, Clone, Copy)]
pub struct MousePos {
    pub x: i32,
    pub y: i32,
}

//#[tauri::command]
// pub fn flash_icon<R: Runtime>(
//     webview: Webview<R>,
//     rid: ResourceId,
//     icon: Option<JsImage>,
//     //time:u32,
// ) -> tauri::Result<()> {
//     let resources_table = webview.resources_table();
//     let tray = resources_table.get::<TrayIcon<R>>(rid)?;
//     let icon = match icon {
//         Some(i) => Some(i.into_img(&resources_table)?.as_ref(null).clone()),
//         None => None,
//     };
//     tray.set_icon(icon)
// }
