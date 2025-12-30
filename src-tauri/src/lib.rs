mod commands;
mod disk;
mod upload;
use jieba_rs::Jieba;
use std::sync::RwLock;

use std::{
    sync::atomic::{AtomicBool},
    sync::{Arc,Mutex},
    thread::{JoinHandle}
};

struct AppState {
    jieba: RwLock<Jieba>,
    mouse_poller: Mutex<Option<(Arc<AtomicBool>, JoinHandle<()>)>>,
}

// Learn more about Tauri commands at https://tauri.app/v1/guides/features/command
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let state = AppState {
        jieba: RwLock::new(Jieba::new()),
        mouse_poller: Mutex::new(None),
    };
    tauri::Builder::default()
        .plugin(tauri_plugin_positioner::init())
        .manage(state)
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_upload::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        //.plugin(tauri_plugin_websokcet::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            commands::get_mouse_position,
            commands::screenshot,
            commands::get_display_info,
            commands::get_all_screens,
            commands::segment_text,
            commands::batch_segment_text,
            commands::cache_image_to_path,
            commands::url_to_rgba,
            commands::clipboard_image,
            commands::control_mouse_poller,
            disk::get_drive_size,
            disk::get_folder_size,
            // upload::file_download,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
