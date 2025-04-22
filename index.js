import { eventSource, event_types, getRequestHeaders, saveSettingsDebounced } from '../../../../script.js';
import { getContext } from '../../../../scripts/st-context.js';
import { extension_settings } from '../../../extensions.js';

// 插件名称常量
const pluginName = 'cloud-backup';

// 初始化插件设置
if (!extension_settings[pluginName]) {
  extension_settings[pluginName] = {
    enabled: true,
    autoBackup: false,
    backupInterval: 60, // 自动备份间隔，单位分钟
    lastBackup: 0, // 上次备份时间戳
    apiKey: '', // 用于授权的API密钥
    apiUrl: '', // 云端API地址
  };
}

// 调试模式
const DEBUG = true;

// 调试日志函数
function debugLog(...args) {
  if (DEBUG) {
    console.log(`[${pluginName}] DEBUG:`, ...args);
  }
}

// 等待jQuery和DOM完全加载
$(document).ready(function () {
  console.log(`[${pluginName}] 插件初始化中...`);

  // 获取所有聊天数据
  async function getAllChats() {
    try {
      const context = getContext();

      if (!context) {
        console.error(`[${pluginName}] 无法获取上下文`);
        return null;
      }

      // 获取当前聊天ID和角色ID
      const currentChatId = context.chatId;
      const currentCharId = context.characterId;

      // 获取聊天列表API
      const response = await fetch('/api/characters/chats', {
        method: 'GET',
        headers: getRequestHeaders(),
      });

      if (!response.ok) {
        throw new Error(`获取聊天列表失败: ${response.status} ${response.statusText}`);
      }

      const chats = await response.json();
      debugLog(`找到 ${chats.length} 个聊天会话`);

      // 获取每个聊天的详细内容
      const chatContents = [];

      for (const chat of chats) {
        try {
          const chatResponse = await fetch(`/api/characters/chats/${chat.character_id}/${chat.chat_id}`, {
            method: 'GET',
            headers: getRequestHeaders(),
          });

          if (!chatResponse.ok) {
            console.error(`[${pluginName}] 获取聊天 ${chat.chat_id} 失败:`, chatResponse.status);
            continue;
          }

          const chatData = await chatResponse.json();
          chatContents.push({
            chat_id: chat.chat_id,
            character_id: chat.character_id,
            name: chat.name || '未命名聊天',
            data: chatData,
          });

          debugLog(`已获取聊天: ${chat.name} (ID: ${chat.chat_id})`);
        } catch (error) {
          console.error(`[${pluginName}] 获取聊天 ${chat.chat_id} 时出错:`, error);
        }
      }

      return {
        chats: chatContents,
        currentChatId,
        currentCharId,
        timestamp: Date.now(),
        metadata: {
          version: '1.0',
          platform: 'SillyTavern',
          pluginName: pluginName,
        },
      };
    } catch (error) {
      console.error(`[${pluginName}] 获取聊天数据时出错:`, error);
      return null;
    }
  }

  // 上传数据到云端
  async function uploadToCloud(data) {
    try {
      if (!extension_settings[pluginName].apiUrl || !extension_settings[pluginName].apiKey) {
        toastr.error('请先设置API地址和密钥');
        return { success: false, error: '未配置API信息' };
      }

      // 构建URL，将apiKey作为auth参数
      const apiUrl = extension_settings[pluginName].apiUrl;
      // 检查URL是否已包含.json扩展名
      const baseUrl = apiUrl.endsWith('.json') ? apiUrl : `${apiUrl}${apiUrl.endsWith('/') ? '' : '/'}backups.json`;
      // 添加auth参数
      const apiUrlWithAuth = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}auth=${
        extension_settings[pluginName].apiKey
      }`;

      console.log(
        `[${pluginName}] 准备上传到: ${apiUrlWithAuth.replace(extension_settings[pluginName].apiKey, '***')}`,
      );

      const response = await fetch(apiUrlWithAuth, {
        method: 'PUT', // 使用PUT而不是POST，更适合Firebase
        headers: {
          'Content-Type': 'application/json',
          // 移除Authorization头，因为auth已经在URL中
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error(`上传失败: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      return { success: true, result };
    } catch (error) {
      console.error(`[${pluginName}] 上传到云端时出错:`, error);
      return { success: false, error: error.message };
    }
  }

  // 执行备份操作
  async function performBackup() {
    try {
      if (!extension_settings[pluginName].enabled) {
        debugLog('插件已禁用，跳过备份');
        return;
      }

      toastr.info('开始备份聊天数据...');

      const allChats = await getAllChats();
      if (!allChats) {
        toastr.error('获取聊天数据失败');
        return;
      }

      debugLog(`准备上传 ${allChats.chats.length} 个聊天会话`);

      // 上传到云端
      const uploadResult = await uploadToCloud(allChats);

      if (uploadResult.success) {
        toastr.success('备份成功!');
        extension_settings[pluginName].lastBackup = Date.now();
        saveSettingsDebounced();
      } else {
        toastr.error(`备份失败: ${uploadResult.error}`);
      }

      return uploadResult;
    } catch (error) {
      console.error(`[${pluginName}] 执行备份时出错:`, error);
      toastr.error(`备份操作失败: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  // 导出聊天数据到本地文件
  function exportChatsToFile(data) {
    try {
      if (!data) {
        toastr.error('没有数据可导出');
        return;
      }

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `chat-backup-${timestamp}.json`;

      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();

      URL.revokeObjectURL(url);
      toastr.success('聊天数据已导出到文件');
    } catch (error) {
      console.error(`[${pluginName}] 导出到文件时出错:`, error);
      toastr.error(`导出到文件失败: ${error.message}`);
    }
  }

  // 检查自动备份
  function checkAutoBackup() {
    if (!extension_settings[pluginName].enabled || !extension_settings[pluginName].autoBackup) {
      return;
    }

    const now = Date.now();
    const lastBackup = extension_settings[pluginName].lastBackup || 0;
    const interval = extension_settings[pluginName].backupInterval * 60 * 1000; // 转换为毫秒

    if (now - lastBackup >= interval) {
      debugLog('执行自动备份...');
      performBackup();
    }
  }

  // 创建设置UI
  function createSettings() {
    // 检查设置面板是否已存在
    if ($('#cloud-backup-settings').length > 0) {
      console.log(`[${pluginName}] 设置UI已存在，跳过创建`);
      return;
    }

    console.log(`[${pluginName}] 开始创建设置UI...`);

    // 加载外部HTML模板
    jQuery.ajax({
      url: `/scripts/extensions/${pluginName}/settings_display.html`,
      cache: false,
      success: function (html) {
        // 添加UI到设置区域
        $('#extensions_settings').append(html);

        console.log(`[${pluginName}] 设置模板加载成功，已添加到DOM`);

        // 更新UI元素的值
        $('#cloud-backup-toggle').val(extension_settings[pluginName].enabled ? 'enabled' : 'disabled');
        $('#cloud-backup-auto-toggle').prop('checked', extension_settings[pluginName].autoBackup);
        $('#cloud-backup-interval').val(extension_settings[pluginName].backupInterval);
        $('#cloud-backup-api-url').val(extension_settings[pluginName].apiUrl);
        $('#cloud-backup-api-key').val(extension_settings[pluginName].apiKey);

        if (extension_settings[pluginName].lastBackup) {
          $('#cloud-backup-last-time').text(new Date(extension_settings[pluginName].lastBackup).toLocaleString());
        }

        // 绑定事件处理器
        bindSettingsEvents();

        // 初始化抽屉功能
        initializeDrawer();
      },
      error: function (jqXHR, textStatus, errorThrown) {
        console.error(`[${pluginName}] 加载设置模板失败:`, textStatus, errorThrown);
        // 失败时使用备用方法
        createSettingsFallback();
      },
    });
  }

  // 备用设置创建方法（在加载HTML模板失败时使用）
  function createSettingsFallback() {
    console.log(`[${pluginName}] 使用备用方法创建设置UI...`);

    // 创建HTML模板字符串
    const settingsHtml = `
      <div id="cloud-backup-settings" class="cloud-backup-container extensions_settings">
          <div class="inline-drawer">
              <div class="inline-drawer-toggle inline-drawer-header">
                  <b>聊天云备份</b>
                  <div class="inline-drawer-icon fa-solid fa-circle-chevron-down"></div>
              </div>
              <div class="inline-drawer-content" style="display:none;">
                  <div class="cloud-backup-section">
                      <div class="cloud-backup-row">
                          <span class="cloud-backup-label">插件状态:</span>
                          <select id="cloud-backup-toggle">
                              <option value="enabled">开启</option>
                              <option value="disabled">关闭</option>
                          </select>
                      </div>
                      
                      <div class="cloud-backup-row">
                          <span class="cloud-backup-label">自动备份:</span>
                          <input type="checkbox" id="cloud-backup-auto-toggle" ${
                            extension_settings[pluginName].autoBackup ? 'checked' : ''
                          }>
                      </div>
                      
                      <div class="cloud-backup-row">
                          <span class="cloud-backup-label">备份间隔 (分钟):</span>
                          <input type="number" id="cloud-backup-interval" min="5" value="${
                            extension_settings[pluginName].backupInterval
                          }">
                      </div>
                      
                      <div class="cloud-backup-row">
                          <span class="cloud-backup-label">API地址:</span>
                          <input type="text" id="cloud-backup-api-url" value="${
                            extension_settings[pluginName].apiUrl
                          }" placeholder="https://example.com/api/backup">
                      </div>
                      
                      <div class="cloud-backup-row">
                          <span class="cloud-backup-label">API密钥:</span>
                          <input type="password" id="cloud-backup-api-key" value="${
                            extension_settings[pluginName].apiKey
                          }" placeholder="您的API密钥">
                      </div>
                      
                      <div class="cloud-backup-row">
                          <button id="cloud-backup-now-button" class="menu_button">立即备份</button>
                          <button id="cloud-backup-export-button" class="menu_button">导出到本地</button>
                      </div>
                      
                      <div class="cloud-backup-row">
                          <span class="cloud-backup-label">上次备份:</span>
                          <span id="cloud-backup-last-time">${
                            extension_settings[pluginName].lastBackup
                              ? new Date(extension_settings[pluginName].lastBackup).toLocaleString()
                              : '从未'
                          }</span>
                      </div>
                  </div>
                  <hr class="sysHR">
              </div>
          </div>
      </div>`;

    // 添加UI到设置区域
    $('#extensions_settings').append(settingsHtml);

    // 绑定事件处理器
    bindSettingsEvents();

    // 初始化抽屉功能
    initializeDrawer();
  }

  // 绑定设置事件处理器
  function bindSettingsEvents() {
    // 插件状态切换
    $('#cloud-backup-toggle').on('change', function () {
      extension_settings[pluginName].enabled = $(this).val() === 'enabled';
      saveSettingsDebounced();
      toastr.info(`云备份插件已${extension_settings[pluginName].enabled ? '启用' : '禁用'}`);
    });

    // 自动备份切换
    $('#cloud-backup-auto-toggle').on('change', function () {
      extension_settings[pluginName].autoBackup = $(this).prop('checked');
      saveSettingsDebounced();
    });

    // 备份间隔设置
    $('#cloud-backup-interval').on('change', function () {
      const value = parseInt($(this).val());
      if (value >= 5) {
        extension_settings[pluginName].backupInterval = value;
        saveSettingsDebounced();
      } else {
        $(this).val(5);
        toastr.warning('备份间隔最小为5分钟');
      }
    });

    // API地址设置
    $('#cloud-backup-api-url').on('change', function () {
      extension_settings[pluginName].apiUrl = $(this).val().trim();
      saveSettingsDebounced();
    });

    // API密钥设置
    $('#cloud-backup-api-key').on('change', function () {
      extension_settings[pluginName].apiKey = $(this).val().trim();
      saveSettingsDebounced();
    });

    // 立即备份按钮
    $('#cloud-backup-now-button').on('click', async function () {
      $(this).prop('disabled', true).text('备份中...');

      try {
        const result = await performBackup();

        if (result && result.success) {
          // 更新上次备份时间显示
          $('#cloud-backup-last-time').text(new Date().toLocaleString());
        }
      } catch (error) {
        console.error(`[${pluginName}] 备份按钮点击处理出错:`, error);
      } finally {
        $(this).prop('disabled', false).text('立即备份');
      }
    });

    // 导出到本地按钮
    $('#cloud-backup-export-button').on('click', async function () {
      $(this).prop('disabled', true).text('导出中...');

      try {
        const data = await getAllChats();
        exportChatsToFile(data);
      } catch (error) {
        console.error(`[${pluginName}] 导出按钮点击处理出错:`, error);
      } finally {
        $(this).prop('disabled', false).text('导出到本地');
      }
    });
  }

  // 初始化抽屉展开/收起功能
  function initializeDrawer() {
    console.log(`[${pluginName}] 初始化抽屉功能`);

    // 检查选择器是否有效
    const toggleElements = $('#cloud-backup-settings .inline-drawer-toggle');
    console.log(`[${pluginName}] 找到 ${toggleElements.length} 个抽屉切换元素`);

    toggleElements.off('click').on('click', function () {
      const icon = $(this).find('.inline-drawer-icon');
      const content = $(this).next('.inline-drawer-content');

      console.log(`[${pluginName}] 抽屉点击: 内容可见性=${content.is(':visible')}`);

      if (content.is(':visible')) {
        icon.removeClass('fa-circle-chevron-up').addClass('fa-circle-chevron-down');
        content.slideUp(200);
      } else {
        icon.removeClass('fa-circle-chevron-down').addClass('fa-circle-chevron-up');
        content.slideDown(200);
      }
    });

    // 添加全局CSS样式修复
    const style = document.createElement('style');
    style.innerHTML = `
      #cloud-backup-settings .inline-drawer-content {
        height: auto !important;
        transition: all 0.3s ease;
      }
    `;
    document.head.appendChild(style);

    // 检查抽屉是否正确初始化，如果没有，手动再次尝试
    setTimeout(() => {
      if ($('#cloud-backup-settings').length > 0) {
        console.log(`[${pluginName}] 设置面板已找到，重新检查事件绑定`);
        toggleElements.off('click').on('click', function () {
          const icon = $(this).find('.inline-drawer-icon');
          const content = $(this).next('.inline-drawer-content');

          if (content.is(':visible')) {
            icon.removeClass('fa-circle-chevron-up').addClass('fa-circle-chevron-down');
            content.slideUp(200);
          } else {
            icon.removeClass('fa-circle-chevron-down').addClass('fa-circle-chevron-up');
            content.slideDown(200);
          }
        });
      } else {
        console.log(`[${pluginName}] 设置面板未找到，可能需要重新创建`);
      }
    }, 1000);
  }

  // 插件初始化时执行的事件
  eventSource.on(event_types.EXTENSIONS_FIRST_LOAD, () => {
    console.log(`[${pluginName}] 插件加载中...`);
    try {
      // 尝试创建设置UI
      setTimeout(() => {
        console.log(`[${pluginName}] 准备创建设置UI (延迟1秒)`);
        createSettings();
      }, 1000);

      // 多次尝试确保设置UI被正确创建
      setTimeout(() => {
        if ($('#cloud-backup-settings').length === 0) {
          console.log(`[${pluginName}] 3秒后仍未找到设置UI，尝试重新创建`);
          createSettings();
        } else {
          console.log(`[${pluginName}] 设置UI已存在，检查抽屉功能`);
          initializeDrawer();
        }
      }, 3000);

      // 再次检查，确保设置完全加载
      setTimeout(() => {
        if ($('#cloud-backup-settings').length === 0) {
          console.log(`[${pluginName}] 5秒后仍未找到设置UI，最后尝试重新创建`);
          createSettingsFallback(); // 直接使用备用方法
        } else {
          console.log(`[${pluginName}] 设置UI存在，确保事件绑定`);
          bindSettingsEvents();
          initializeDrawer();
        }
      }, 5000);

      console.log(`[${pluginName}] 初始化完成，设置定时检查`);

      // 定期检查自动备份
      setInterval(checkAutoBackup, 60000); // 每分钟检查一次
    } catch (error) {
      console.error(`[${pluginName}] 插件加载出错:`, error);
      // 尝试使用备用方法
      setTimeout(() => {
        try {
          console.log(`[${pluginName}] 出错后尝试使用备用方法`);
          createSettingsFallback();
        } catch (fallbackError) {
          console.error(`[${pluginName}] 备用方法也出错:`, fallbackError);
        }
      }, 2000);
    }
  });

  // 监听DOM变化，确保设置面板在SillyTavern的设置被打开时可见
  $(document).on('click', '#settings_button', function () {
    console.log(`[${pluginName}] 设置按钮被点击`);
    setTimeout(() => {
      if ($('#cloud-backup-settings').length === 0 && $('#extensions_settings').is(':visible')) {
        console.log(`[${pluginName}] 设置已打开但未找到插件UI，尝试创建`);
        createSettingsFallback();
      }
    }, 500);
  });
});

console.log(`[${pluginName}] 插件初始化完成，等待文档加载...`);
