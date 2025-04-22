# 聊天云备份插件

这个插件允许您将SillyTavern的所有聊天数据备份到云端服务器或导出到本地文件。

## 功能

- 获取并聚合所有聊天数据
- 上传备份到自定义API端点
- 导出聊天数据到本地JSON文件
- 支持自动定时备份
- 使用API密钥进行授权

## 设置

1. 启用插件
2. 设置您的云端API地址和密钥
3. (可选) 启用自动备份并设置时间间隔

## 服务器要求

您需要一个接收备份数据的API服务器，该服务器应该：

1. 接受POST请求
2. 验证Authorization头部的Bearer令牌
3. 处理并存储JSON格式的聊天数据

## 数据格式

备份数据为JSON格式：

```json
{
  "chats": [
    {
      "chat_id": "聊天ID",
      "character_id": "角色ID",
      "name": "聊天名称",
      "data": { /* 聊天内容数据 */ }
    },
    // 更多聊天...
  ],
  "currentChatId": "当前打开的聊天ID",
  "currentCharId": "当前角色ID",
  "timestamp": 1650000000000,
  "metadata": {
    "version": "1.0",
    "platform": "SillyTavern",
    "pluginName": "cloud-backup"
  }
}
```

## 注意事项

- 请确保您的API服务器安全可靠
- 大量聊天数据可能导致备份过程较慢
- 请勿将API密钥泄露给他人

## 贡献

欢迎提出建议或贡献代码改进。 