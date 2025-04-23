// 创建并显示弹窗
function showDialog() {
  // 获取图片信息
  chrome.runtime.sendMessage({ action: "getContextImage" }, (response) => {
    if (response && response.success && response.data) {
      createDialogElement(response.data);
    }
  });
}

// 创建弹窗元素
function createDialogElement(imageData) {
  // 创建弹窗容器
  const dialog = document.createElement('div');
  dialog.id = 'temu-image-dialog';
  dialog.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: white;
    padding: 20px;
    border-radius: 8px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    z-index: 999999;
    max-width: 500px;
    width: 90%;
  `;

  // 创建弹窗内容
  dialog.innerHTML = `
    <div style="position: relative;">
      <h2 style="margin: 0 0 15px; color: #333;">保存图片</h2>
      <div style="margin-bottom: 15px;">
        <img src="${imageData.imageUrl}" style="max-width: 100%; max-height: 200px; display: block; margin: 0 auto;">
      </div>
      <div style="margin-bottom: 10px;">
        <label style="display: block; margin-bottom: 5px;">形状类型：</label>
        <select id="shapeType" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
          <option value="square">方形</option>
          <option value="circle">圆形</option>
          <option value="rectangle">长方形</option>
        </select>
      </div>
      <div style="margin-bottom: 10px;">
        <label style="display: block; margin-bottom: 5px;">创建时间：</label>
        <input type="text" id="timestamp" value="${new Date().toLocaleString('zh-CN')}" readonly 
               style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; background: #f5f5f5;">
      </div>
      <div style="margin-bottom: 10px;">
        <label style="display: block; margin-bottom: 5px;">备注：</label>
        <textarea id="notes" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; min-height: 80px;"></textarea>
      </div>
      <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;">
        <button id="cancelBtn" style="padding: 8px 16px; border: 1px solid #ddd; border-radius: 4px; background: #f5f5f5; cursor: pointer;">取消</button>
        <button id="saveBtn" style="padding: 8px 16px; border: none; border-radius: 4px; background: #1a73e8; color: white; cursor: pointer;">保存</button>
      </div>
    </div>
  `;

  // 添加遮罩层
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0,0,0,0.5);
    z-index: 999998;
    cursor: pointer;
  `;

  // 添加到页面
  document.body.appendChild(overlay);
  document.body.appendChild(dialog);

  // 绑定事件
  const cancelBtn = dialog.querySelector('#cancelBtn');
  const saveBtn = dialog.querySelector('#saveBtn');

  // 点击遮罩层关闭弹窗
  overlay.addEventListener('click', () => {
    overlay.remove();
    dialog.remove();
  });

  cancelBtn.addEventListener('click', () => {
    overlay.remove();
    dialog.remove();
  });

  saveBtn.addEventListener('click', async () => {
    try {
      saveBtn.disabled = true;
      saveBtn.textContent = '保存中...';
      
      const formData = {
        shape: dialog.querySelector('#shapeType').value,
        timestamp: dialog.querySelector('#timestamp').value,
        notes: dialog.querySelector('#notes').value || '',
        sourceUrl: imageData.pageUrl,
        imageUrl: imageData.imageUrl,
        savedAt: new Date().toISOString(),
        originalUrl: window.location.href
      };

      // 发送保存请求
      chrome.runtime.sendMessage({
        action: "saveFiles",
        imageData: {
          url: imageData.imageUrl,
          extension: getImageExtension(imageData.imageUrl)
        },
        jsonData: formData
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('保存失败:', chrome.runtime.lastError);
          showNotification('保存失败: ' + chrome.runtime.lastError.message, 'error');
          saveBtn.disabled = false;
          saveBtn.textContent = '保存';
          return;
        }

        if (response && response.success) {
          showNotification('保存成功！');
          closeDialog(overlay, dialog);
        } else {
          const errorMessage = response?.error || '未知错误';
          console.error('保存失败:', errorMessage);
          showNotification('保存失败: ' + errorMessage, 'error');
          saveBtn.disabled = false;
          saveBtn.textContent = '保存';
        }
      });
    } catch (error) {
      console.error('保存过程出错:', error);
      showNotification('保存失败: ' + error.message, 'error');
      saveBtn.disabled = false;
      saveBtn.textContent = '保存';
    }
  });
}

// 获取图片扩展名
function getImageExtension(url) {
  try {
    const pathname = new URL(url).pathname;
    const ext = pathname.split('.').pop().toLowerCase();
    return ext.match(/^(jpg|jpeg|png|gif|webp)$/) ? `.${ext}` : '.jpg';
  } catch {
    return '.jpg';
  }
}

// 显示通知
function showNotification(message, type = 'success') {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: ${type === 'success' ? '#4CAF50' : '#F44336'};
    color: white;
    padding: 12px 24px;
    border-radius: 4px;
    box-shadow: 0 2px 5px rgba(0,0,0,0.2);
    z-index: 999999;
  `;
  notification.textContent = message;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.remove();
  }, 3000);
}

// 关闭弹窗
function closeDialog(overlay, dialog) {
  overlay.remove();
  dialog.remove();
}

// 初始化
showDialog();

// 定义添加图片监听的函数
function addImageHoverListeners() {
  const images = document.querySelectorAll('img');
  console.log('找到的图片数量:', images.length);

  images.forEach((img) => {
    // 避免重复绑定事件
    if (img.hasAttribute('data-hover-listener')) return;
    img.setAttribute('data-hover-listener', 'true');

    let timeoutId;

    img.addEventListener('mouseenter', () => {
      console.log('鼠标进入图片区域:', img.src);
      timeoutId = setTimeout(() => {
        console.log('准备发送获取图片信息的消息:', img.src);
        chrome.runtime.sendMessage({ action: "getContextImage", imageUrl: img.src, pageUrl: window.location.href }, (response) => {
          if (chrome.runtime.lastError) {
            console.error('发送消息出错:', chrome.runtime.lastError);
            return;
          }
          if (response && response.success && response.data) {
            console.log('成功获取图片信息，创建弹窗');
            createDialogElement(response.data);
          } else {
            console.error('获取图片信息失败:', response?.error || '未知错误');
          }
        });
      }, 1000);
    });

    img.addEventListener('mouseleave', () => {
      console.log('鼠标离开图片区域，清除定时器');
      clearTimeout(timeoutId);
    });
  });
}

// 页面加载完成后添加监听
if (document.readyState === 'interactive' || document.readyState === 'complete') {
  addImageHoverListeners();
} else {
  document.addEventListener('DOMContentLoaded', addImageHoverListeners);
}

// 使用 MutationObserver 监听动态添加的图片
const observer = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    if (mutation.addedNodes.length) {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (node.tagName === 'IMG') {
            addImageHoverListeners();
          } else {
            const nestedImages = node.querySelectorAll('img');
            if (nestedImages.length) {
              addImageHoverListeners();
            }
          }
        }
      });
    }
  });
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});

// 添加全局点击事件监听器
document.addEventListener('click', (event) => {
    const popup = document.getElementById('yourPopupId'); // 替换为你的弹窗实际ID
    if (popup && !popup.contains(event.target)) {
        // 如果点击发生在弹窗外部，则关闭弹窗
        popup.style.display = 'none';
    }
});