use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use tauri::{plugin::{Builder, TauriPlugin}, Runtime, State};
use tokio::net::TcpStream;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

#[derive(Default)]
struct TcpState;

#[derive(Serialize, Deserialize, Debug)]
pub struct TcpRequest {
    address: String,
    port: u16,
    message: serde_json::Value,
}

#[tauri::command]
pub async fn send_tcp_message(request: TcpRequest) -> Result<String, String> {
    let addr: SocketAddr = format!("{}:{}", request.address, request.port)
        .parse()
        .map_err(|e| format!("Invalid address or port: {}", e))?;
    
    // Initiate a TCP connection
    match TcpStream::connect(&addr).await {
        Ok(mut stream) => {
            // Serialize the message to JSON string
            let message = serde_json::to_string(&request.message)
                .map_err(|e| format!("Failed to serialize message: {}", e))?;
            
            // Send the JSON message
            stream.write_all(message.as_bytes()).await.map_err(|e| format!("Failed to send message: {}", e))?;
            
            // Read the response (assuming server responds back)
            let mut buffer = [0u8; 1024];
            let n = stream.read(&mut buffer).await.map_err(|e| format!("Failed to read response: {}", e))?;
            
            let response = String::from_utf8_lossy(&buffer[..n]).to_string();
            Ok(response)
        },
        Err(e) => Err(format!("Failed to connect: {}", e)),
    }
}
