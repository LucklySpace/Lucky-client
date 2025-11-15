use std::fs;
use std::path::Path;
use sysinfo::{DiskExt, System, SystemExt};

#[tauri::command]
pub fn get_drive_size(path: String) -> Result<(u64, u64), String> {
    let mut sys = System::new_all();
    sys.refresh_disks_list();
    for disk in sys.disks() {
        if disk.mount_point().to_str() == Some(&path) {
            return Ok((disk.total_space(), disk.available_space()));
        }
    }
    Err("未找到指定盘符".to_string())
}

#[tauri::command]
pub fn get_folder_size(path: String) -> Result<u64, String> {
    fn dir_size(path: &Path) -> u64 {
        fs::read_dir(path)
            .unwrap()
            .filter_map(|entry| {
                let entry = entry.unwrap();
                let metadata = entry.metadata().unwrap();
                if metadata.is_dir() {
                    Some(dir_size(&entry.path()))
                } else {
                    Some(metadata.len())
                }
            })
            .sum()
    }
    let path = Path::new(&path);
    if path.exists() {
        Ok(dir_size(path))
    } else {
        Err("文件夹路径不存在".to_string())
    }
}
