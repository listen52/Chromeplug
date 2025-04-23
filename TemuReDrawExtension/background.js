// 全局变量，用于存储右键点击的图片信息
let contextMenuClickData = null;

// 自定义生成类似 UUID 的函数
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

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

                // 生成UUID
                const uuid = generateUUID();

                // 创建FormData对象
                const formData = new FormData();
                
                // 添加图片数据
                fetch(imageData.url)
                    .then(response => response.blob())
                    .then(blob => {
                        // 使用UUID作为图片名称
                        formData.append('image', blob, `${uuid}${imageData.extension}`);
                        
                        // 添加JSON数据中的每个字段
                        for (const [key, value] of Object.entries(jsonData)) {
                            formData.append(key, value);
                        }

                        // 发送POST请求
                        return fetch('http://127.0.0.1:5000/gift/save', {
                            method: 'POST',
                            body: formData
                        });
                    })
                    .then(response => {
                        if (!response.ok) {
                            throw new Error('网络响应不正常');
                        }
                        return response.json();
                    })
                    .then(data => {
                        sendResponse({ success: true, data: data });
                    })
                    .catch(error => {
                        console.error('请求失败:', error);
                        sendResponse({ success: false, error: error.message });
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