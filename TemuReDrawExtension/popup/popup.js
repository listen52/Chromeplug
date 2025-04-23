// 全局变量
let currentImageUrl = null;
let apiEndpoint = null;
let currentImageData = null;

// 文档加载完成后执行
document.addEventListener('DOMContentLoaded', async () => {
  // 初始化界面
  initUI();
  
  // 获取API端点设置
  chrome.storage.local.get(['apiEndpoint'], (result) => {
    apiEndpoint = result.apiEndpoint;
  });
  
  // 获取右键点击的图片信息
  const imageData = await getContextImage();
  
  if (imageData && imageData.imageUrl) {
    // 保存当前图片数据
    currentImageData = imageData;
    currentImageUrl = imageData.imageUrl;
    
    // 设置图片预览
    setupImagePreview(imageData);
    setupFormData(imageData);
  } else {
    // 没有图片信息，显示错误
    showStatus('没有选择图片或图片信息已失效', 'error');
    disableForm();
  }
  
  // 设置表单事件监听
  setupFormEvents();
  setupButtonEvents();
});

// 初始化UI
function initUI() {
  updateTargetRatioOptions();
  // 设置当前时间
  const now = new Date();
  document.getElementById('timestamp').value = now.toLocaleString('zh-CN');
}

// 从背景脚本获取右键点击的图片信息
function getContextImage() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'getContextImage' }, (response) => {
      if (response && response.success && response.data) {
        resolve(response.data);
      } else {
        resolve(null);
      }
    });
  });
}

// 设置图片预览
function setupImagePreview(imageData) {
  const previewImage = document.getElementById('previewImage');
  previewImage.src = imageData.imageUrl;
  
  // 显示图片信息
  const imageInfo = document.getElementById('imageInfo');
  imageInfo.textContent = `来自: ${new URL(imageData.pageUrl).hostname}`;
  
  // 获取图片尺寸（加载完成后）
  previewImage.onload = () => {
    imageInfo.textContent += ` | 尺寸: ${previewImage.naturalWidth}x${previewImage.naturalHeight}`;
  };
}

// 设置表单数据
function setupFormData(imageData) {
  // 设置源网址
  document.getElementById('sourceUrl').value = imageData.pageUrl;
}

// 设置表单事件监听
function setupFormEvents() {
  // 提示词输入事件
  const promptTextarea = document.getElementById('prompt');
  promptTextarea.addEventListener('input', handlePromptInput);
  
  // 重绘类型变更事件
  const redrawTypeSelect = document.getElementById('redrawType');
  redrawTypeSelect.addEventListener('change', updateTargetRatioOptions);
  
  // 取消按钮事件
  const cancelBtn = document.getElementById('cancelBtn');
  cancelBtn.addEventListener('click', () => {
    window.close();
  });
  
  // 提交按钮事件
  const submitBtn = document.getElementById('submitBtn');
  submitBtn.addEventListener('click', handleSubmit);
}

// 设置按钮事件
function setupButtonEvents() {
  // 保存按钮
  document.getElementById('saveBtn').addEventListener('click', async () => {
    if (!currentImageData) {
      showStatus('没有可用的图片数据', 'error');
      return;
    }

    try {
      await saveImageAndMetadata();
    } catch (error) {
      showStatus('保存失败: ' + error.message, 'error');
    }
  });
}

// 保存图片和元数据
async function saveImageAndMetadata() {
  showStatus('正在保存...', 'loading');
  
  // 收集表单数据
  const metadata = {
    shape: document.getElementById('shapeType').value,
    timestamp: document.getElementById('timestamp').value,
    sourceUrl: document.getElementById('sourceUrl').value,
    notes: document.getElementById('notes').value,
    imageUrl: currentImageData.imageUrl,
    originalWidth: document.getElementById('previewImage').naturalWidth,
    originalHeight: document.getElementById('previewImage').naturalHeight
  };

  // 生成文件名（不含扩展名）
  const baseFileName = `temu_image_${Date.now()}`;
  
  try {
    // 下载图片
    const imageBlob = await downloadImage(currentImageData.imageUrl);
    const imageExtension = getImageExtension(currentImageData.imageUrl);
    
    // 下载图片
    await downloadFile(imageBlob, `${baseFileName}${imageExtension}`);
    
    // 保存 JSON 元数据
    const jsonBlob = new Blob([JSON.stringify(metadata, null, 2)], { type: 'application/json' });
    await downloadFile(jsonBlob, `${baseFileName}.json`);
    
    showStatus('保存成功！', 'success');
    setTimeout(() => window.close(), 1500);
  } catch (error) {
    throw new Error('保存文件失败: ' + error.message);
  }
}

// 下载图片
async function downloadImage(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    return await response.blob();
  } catch (error) {
    throw new Error('下载图片失败: ' + error.message);
  }
}

// 下载文件
function downloadFile(blob, filename) {
  return new Promise((resolve, reject) => {
    chrome.downloads.download({
      url: URL.createObjectURL(blob),
      filename: filename,
      saveAs: false // 使用同一个保存位置
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(downloadId);
      }
      // 清理创建的 URL
      URL.revokeObjectURL(blob);
    });
  });
}

// 获取图片扩展名
function getImageExtension(url) {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const ext = pathname.split('.').pop().toLowerCase();
    return ext.match(/^(jpg|jpeg|png|gif|webp)$/) ? `.${ext}` : '.jpg';
  } catch {
    return '.jpg';
  }
}

// 处理提示词输入
function handlePromptInput() {
  const promptTextarea = document.getElementById('prompt');
  const reversePromptCheckbox = document.getElementById('reversePrompt');
  
  if (promptTextarea.value.trim() !== '') {
    // 如果有自定义提示词，禁用并取消勾选反推提示词
    reversePromptCheckbox.checked = false;
    reversePromptCheckbox.disabled = true;
  } else {
    // 如果没有自定义提示词，启用反推提示词
    reversePromptCheckbox.disabled = false;
  }
}

// 更新目标宽高比选项
function updateTargetRatioOptions() {
  const redrawTypeSelect = document.getElementById('redrawType');
  const targetRatioSelect = document.getElementById('targetRatio');
  const selectedRedrawType = redrawTypeSelect.value;
  
  // 先移除所有选项
  targetRatioSelect.innerHTML = '';
  
  // 判断目标形状
  const isTargetCircle = selectedRedrawType.includes('circle'); // square_to_circle_*, circle_to_circle_*
  const isTargetSquare = selectedRedrawType.endsWith('square') || selectedRedrawType === 'square_to_square'; // circle_to_square, square_to_square
  
  if (isTargetCircle) {
    // 目标是圆形，只允许圆形比例
    const option = document.createElement('option');
    option.value = 'circle';
    option.textContent = '圆形(1:1)';
    targetRatioSelect.appendChild(option);
    targetRatioSelect.disabled = true; // 只有一个选项，禁用选择
  } else if (isTargetSquare) {
    // 目标是方形，只允许方形比例
    const options = [
      { value: 'horizontal', text: '方形横版(3:2)' },
      { value: 'vertical', text: '方形竖版(2:3)' }
    ];
    options.forEach(optData => {
      const option = document.createElement('option');
      option.value = optData.value;
      option.textContent = optData.text;
      targetRatioSelect.appendChild(option);
    });
    targetRatioSelect.disabled = false; // 允许选择横版或竖版
    targetRatioSelect.value = 'horizontal'; // 默认选中横版
  } else {
    // 默认情况或未知类型（理论上不应发生），提供所有选项并禁用
    const defaultOptions = [
        { value: 'circle', text: '圆形(1:1)' },
        { value: 'horizontal', text: '方形横版(3:2)' },
        { value: 'vertical', text: '方形竖版(2:3)' }
    ];
    defaultOptions.forEach(optData => {
      const option = document.createElement('option');
      option.value = optData.value;
      option.textContent = optData.text;
      targetRatioSelect.appendChild(option);
    });
    targetRatioSelect.disabled = true;
  }
}

// 禁用表单
function disableForm() {
  document.getElementById('redrawForm').querySelectorAll('input, select, textarea, button').forEach(element => {
    if (element.id !== 'cancelBtn') {
      element.disabled = true;
    }
  });
}

// 显示状态信息
function showStatus(message, type = 'loading') {
  const statusEl = document.getElementById('statusMessage');
  statusEl.textContent = message;
  statusEl.className = 'status-message ' + type;
}

// 处理表单提交
async function handleSubmit() {
  // 检查是否有图片URL
  if (!currentImageUrl) {
    showStatus('无效的图片，请重新选择', 'error');
    return;
  }
  
  // 获取表单数据
  const categoryId = "1";
  const redrawType = document.getElementById('redrawType').value;
  const targetRatio = document.getElementById('targetRatio').value;
  const prompt = document.getElementById('prompt').value.trim();
  const reversePrompt = document.getElementById('reversePrompt').checked;
  
  // 校验提示词和反推提示词的互斥关系
  if (prompt !== '' && reversePrompt) {
    showStatus('不能同时使用自定义提示词和反推提示词', 'error');
    return;
  }
  
  // 校验重绘类型和目标宽高比的兼容性
  const isTargetCircle = redrawType.includes('circle');
  const isTargetSquare = redrawType.endsWith('square') || redrawType === 'square_to_square';

  if (isTargetCircle && targetRatio !== 'circle') {
      showStatus('目标为圆形的重绘类型，目标宽高比必须为圆形(1:1)', 'error');
      return;
  }
  if (isTargetSquare && (targetRatio !== 'horizontal' && targetRatio !== 'vertical')) {
      showStatus('目标为方形的重绘类型，目标宽高比必须为方形横版(3:2)或方形竖版(2:3)', 'error');
      return;
  }

  // 禁用表单，防止重复提交
  const submitBtn = document.getElementById('submitBtn');
  submitBtn.disabled = true;
  
  // 显示加载状态
  showStatus('正在下载图片...');
  
  try {
    // 下载图片
    const imageBlob = await downloadImage(currentImageUrl);
    
    // 更新状态
    showStatus('正在提交重绘任务...');
    
    // 构建FormData
    const formData = new FormData();
    formData.append('image', imageBlob, `image${getImageExtension(currentImageUrl)}`);
    formData.append('categoryId', categoryId);
    formData.append('redrawType', redrawType);
    formData.append('targetRatio', targetRatio);
    
    if (prompt) {
      formData.append('prompt', prompt);
    }
    
    formData.append('reversePrompt', reversePrompt ? '1' : '0');
    
    // 提交到API
    const response = await fetch(apiEndpoint, {
      method: 'POST',
      body: formData
    });
    
    // 解析响应
    const result = await response.json();
    
    if (response.ok && result.success) {
      // 任务创建成功
      showStatus(`任务创建成功！任务ID: ${result.data.id}`, 'success');
      
      // 重新启用提交按钮 - 即使在成功情况下也恢复按钮状态，代码更一致
      submitBtn.disabled = false;
      
      // 显示通知
      chrome.notifications.create({
        type: 'basic',
        iconUrl: '../icons/icon128.png',
        title: '重绘任务已创建',
        message: `任务ID: ${result.data.id}`
      });
      
      // 3秒后关闭窗口
      setTimeout(() => {
        window.close();
      }, 3000);
    } else {
      // 任务创建失败
      showStatus(`任务创建失败: ${result.message || '未知错误'}`, 'error');
      submitBtn.disabled = false;
    }
  } catch (error) {
    console.error('提交任务出错:', error);
    showStatus(`提交任务出错: ${error.message}`, 'error');
    submitBtn.disabled = false;
  }
}