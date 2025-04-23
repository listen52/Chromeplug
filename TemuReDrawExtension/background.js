// 全局变量，用于存储右键点击的图片信息
let contextMenuClickData = null;

// 扩展初始化时创建右键菜单
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "saveImageWithInfo",
    title: "保存图片并添加信息...",
    contexts: ["image"]
  });
});

// 处理右键菜单点击事件
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "saveImageWithInfo") {
    // 保存图片信息
    contextMenuClickData = {
      imageUrl: info.srcUrl,
      pageUrl: info.pageUrl,
      timestamp: Date.now()
    };
    
    // 向当前标签页注入内容脚本
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content-script.js']
    });
  }
});

// 监听来自content script的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.action) {
    console.error('收到无效的消息格式');
    sendResponse({ success: false, error: "无效的消息格式" });
    return true;
  }

  switch (message.action) {
    case "getContextImage":
      console.log('收到 getContextImage 消息');
      let data;
      if (message.imageUrl && message.pageUrl) {
        data = {
          imageUrl: message.imageUrl,
          pageUrl: message.pageUrl,
          timestamp: Date.now()
        };
        console.log('使用悬停事件的图片信息返回响应');
        sendResponse({ success: true, data: data });
      } else if (contextMenuClickData) {
        console.log('使用右键菜单的图片信息返回响应');
        sendResponse({ success: true, data: contextMenuClickData });
        contextMenuClickData = null;
      } else {
        console.error('没有可用的图片数据');
        sendResponse({ success: false, error: "没有可用的图片数据" });
      }
      break;

    case "saveFiles":
      try {
        const { imageData, jsonData } = message;
        if (!imageData || !jsonData) {
          sendResponse({ success: false, error: "缺少必要的数据" });
          return true;
        }

        const timestamp = Date.now();
        const baseFileName = `temu_image_${timestamp}`;
        
        // 直接保存JSON字符串
        const jsonString = JSON.stringify(jsonData, null, 2);
        const jsonBytes = new TextEncoder().encode(jsonString);
        const jsonDataUrl = `data:application/json;base64,${btoa(String.fromCharCode(...jsonBytes))}`;

        // 首先保存JSON文件
        chrome.downloads.download({
          url: jsonDataUrl,
          filename: `${baseFileName}.json`,
          saveAs: false
        }, (jsonDownloadId) => {
          if (chrome.runtime.lastError) {
            console.error('保存JSON失败:', chrome.runtime.lastError);
            sendResponse({ success: false, error: chrome.runtime.lastError.message });
            return;
          }

          // JSON保存成功后保存图片
          chrome.downloads.download({
            url: imageData.url,
            filename: `${baseFileName}${imageData.extension}`,
            saveAs: false
          }, (imageDownloadId) => {
            if (chrome.runtime.lastError) {
              console.error('保存图片失败:', chrome.runtime.lastError);
              sendResponse({ success: false, error: chrome.runtime.lastError.message });
            } else {
              sendResponse({ success: true });
            }
          });
        });
        
        return true; // 保持消息通道打开以进行异步响应
      } catch (error) {
        console.error('处理保存请求失败:', error);
        sendResponse({ success: false, error: error.message });
      }
      break;

    default:
      sendResponse({ success: false, error: "未知的操作类型" });
      break;
  }
  return true;
});