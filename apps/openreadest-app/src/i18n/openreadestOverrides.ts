import type i18n from 'i18next';

const BRAND_OVERRIDES: Record<string, string> = {
  'About KiriReadest': 'About Readest',
  'Download KiriReadest': 'Download Readest',
  'Exported from KiriReadest': 'Exported from Readest',
};

const EXPLICIT_OVERRIDES: Record<string, Record<string, string>> = {
  en: {
    'Support KiriReadest': 'Support KiriReadest',
    'If KiriReadest helps you read and learn, you can support its continued development.':
      'If KiriReadest helps you read and learn, you can support its continued development.',
    'KiriReadest Alipay donation QR code': 'KiriReadest Alipay donation QR code',
    'Scan with Alipay, or select a saved image from your photos. Donations are optional.':
      'Scan with Alipay, or select a saved image from your photos. Donations are optional.',
    'Save QR code': 'Save QR code',
    'How to donate': 'How to donate',
    'Take a screenshot, then open Alipay Scan and select it from your photos.':
      'Take a screenshot, then open Alipay Scan and select it from your photos.',
    'Could not save the QR code. Please try again or take a screenshot.':
      'Could not save the QR code. Please try again or take a screenshot.',
    'Could not load the QR code. Please close this window and try again.':
      'Could not load the QR code. Please close this window and try again.',
    License: 'License',
    'Project Links': 'Project Links',
    'GitHub Homepage': 'GitHub Homepage',
    'Report an issue': 'Report an issue',
    检查更新: 'Check for Updates',
    'KiriReadest Update': 'KiriReadest Update',
    查看发布页: 'View release page',
    '当前版本 {{version}}': 'Current version {{version}}',
    '推荐分发通道：{{channel}}': 'Recommended distribution channel: {{channel}}',
    'KiriReadest 的独立更新源正在接入中。当前阶段先保留独立“检查更新”页面，后续会接上远程版本信息、更新日志和下载分发。':
      'KiriReadest is wiring up its independent update source. For now, this separate update page is kept in place and will later connect remote version info, changelogs, and downloads.',
    '现在你可以先通过项目主页查看最新进展；Android 包会继续按 ARM64 优先提供。':
      'For now, you can check the project homepage for the latest progress. Android builds will continue to prioritize ARM64 packages.',
    '这里会同步 KiriReadest 的版本动向，也给你留好项目主页和最新版本入口。':
      'This page tracks KiriReadest version updates and keeps the project homepage and latest release entry ready for you.',
    '如果一时打不开或加载不出来，多半是 GitHub 网络波动，换个时间或者稍后再试就好。':
      'If the page fails to open or load for a while, it is usually due to GitHub network hiccups. Try again a bit later.',
    打开项目主页: 'Open project homepage',
    查看最新发布说明: 'View latest release notes',
    查看最新版本: 'View latest version',
    使用系统文件管理器选择文件夹: 'Use the system file manager to choose a folder',
    'Quick Select Common Folders': 'Quick Select Common Folders',
    常用目录快速选择: 'Quick Select Common Folders',
    'Move Current Data': 'Move Current Data',
    'Use Existing Readest Data': 'Use Existing Readest Data',
    'Existing Readest Data': 'Existing Readest Data',
    'New Data Location': 'New Data Location',
    'Choose Different Existing Folder': 'Choose Different Existing Folder',
    'Choose Existing Folder': 'Choose Existing Folder',
    'Choose Different Folder': 'Choose Different Folder',
    'Choose New Folder': 'Choose New Folder',
    'Select the folder that already contains Readest data, or its parent folder.':
      'Select the folder that already contains Readest data, or its parent folder.',
    'Use Existing Data': 'Use Existing Data',
    'Current Data Location': 'Current Data Location',
    'File count: {{size}}': 'File count: {{size}}',
    'Total size: {{size}}': 'Total size: {{size}}',
    'Calculating file info...': 'Calculating file info...',
    'Connecting existing data...': 'Connecting existing data...',
    'Migrating data...': 'Migrating data...',
    'Copying: {{file}}': 'Copying: {{file}}',
    '{{current}} of {{total}} files': '{{current}} of {{total}} files',
    'Existing data connected successfully!': 'Existing data connected successfully!',
    'Migration completed successfully!': 'Migration completed successfully!',
    'Your data has been moved to the new location. Please restart the application to complete the process.':
      'Your data has been moved to the new location. Please restart the application to complete the process.',
    'Migration failed': 'Migration failed',
    'Important Notice': 'Important Notice',
    'This will move all your app data to the new location. Make sure the destination has enough free space.':
      'This will move all your app data to the new location. Make sure the destination has enough free space.',
    'Change Data Location': 'Change Data Location',
    'Failed to select directory': 'Failed to select directory',
    'No compatible Readest data was found in the selected folder.':
      'No compatible Readest data was found in the selected folder.',
    'The selected data location is already in use.':
      'The selected data location is already in use.',
    'The new data directory must be different from the current one.':
      'The new data directory must be different from the current one.',
    'Failed to use the selected data: {{error}}': 'Failed to use the selected data: {{error}}',
    'Migration failed: {{error}}': 'Migration failed: {{error}}',
    'KiriReadest is independently maintained, based on OpenReadest and Readest.':
      'KiriReadest is independently maintained, based on OpenReadest and Readest.',
    'KiriReadest modifications copyright (c) 2026 kiri603. OpenReadest modifications copyright (c) 2026 luyishui. Readest copyright Bilingify LLC and contributors.':
      'KiriReadest modifications copyright (c) 2026 kiri603. OpenReadest modifications copyright (c) 2026 luyishui. Readest copyright Bilingify LLC and contributors.',
    'Get Help from the Readest Community': 'Get Help from the KiriReadest Community',
    'Need help? Contact our support team at support@readest.com':
      'Need help? Please open an issue in the KiriReadest repository.',
    'Choose a new folder for KiriReadest to move its data into.':
      'Choose a new folder for KiriReadest to move its data into.',
    'KiriReadest will use the selected Readest data after restart. Please restart the application to complete the switch.':
      'KiriReadest will use the selected Readest data after restart. Please restart the application to complete the switch.',
    'This will switch KiriReadest to the selected Readest data location. Make sure you selected the library you want to continue using.':
      'This will switch KiriReadest to the selected Readest data location. Make sure you selected the library you want to continue using.',
  },
  'zh-CN': {
    'Support KiriReadest': '支持 KiriReadest',
    'If KiriReadest helps you read and learn, you can support its continued development.':
      '如果 KiriReadest 帮助你阅读与学习，欢迎支持项目的持续维护与开发。',
    'KiriReadest Alipay donation QR code': 'KiriReadest 支付宝捐赠收款码',
    'Scan with Alipay, or select a saved image from your photos. Donations are optional.':
      '使用支付宝扫一扫，或保存图片后从相册识别。捐赠完全自愿。',
    'Save QR code': '保存收款码',
    'How to donate': '如何捐赠',
    'Take a screenshot, then open Alipay Scan and select it from your photos.':
      '请先截图，再打开支付宝扫一扫，从相册选择收款码。',
    'Could not save the QR code. Please try again or take a screenshot.':
      '保存收款码失败，请重试或直接截图。',
    'Could not load the QR code. Please close this window and try again.':
      '收款码加载失败，请关闭窗口后重试。',
    License: '许可证',
    'Project Links': '项目链接',
    'GitHub Homepage': 'GitHub 主页',
    'Report an issue': '反馈问题',
    检查更新: '检查更新',
    'KiriReadest Update': 'KiriReadest Update',
    查看发布页: '查看发布页',
    '当前版本 {{version}}': '当前版本 {{version}}',
    '推荐分发通道：{{channel}}': '推荐分发通道：{{channel}}',
    'KiriReadest 的独立更新源正在接入中。当前阶段先保留独立“检查更新”页面，后续会接上远程版本信息、更新日志和下载分发。':
      'KiriReadest 的独立更新源正在接入中。当前阶段先保留独立“检查更新”页面，后续会接上远程版本信息、更新日志和下载分发。',
    '现在你可以先通过项目主页查看最新进展；Android 包会继续按 ARM64 优先提供。':
      '现在你可以先通过项目主页查看最新进展；Android 包会继续按 ARM64 优先提供。',
    '这里会同步 KiriReadest 的版本动向，也给你留好项目主页和最新版本入口。':
      '这里会同步 KiriReadest 的版本动向，也给你留好项目主页和最新版本入口。',
    '如果一时打不开或加载不出来，多半是 GitHub 网络波动，换个时间或者稍后再试就好。':
      '如果一时打不开或加载不出来，多半是 GitHub 网络波动，换个时间或者稍后再试就好。',
    打开项目主页: '打开项目主页',
    查看最新发布说明: '查看最新发布说明',
    查看最新版本: '查看最新版本',
    使用系统文件管理器选择文件夹: '使用系统文件管理器选择文件夹',
    'Quick Select Common Folders': '常用目录快速选择',
    常用目录快速选择: '常用目录快速选择',
    'Move Current Data': '迁移当前数据',
    'Use Existing Readest Data': '使用现有 Readest 数据',
    'Existing Readest Data': '现有 Readest 数据',
    'New Data Location': '新的数据位置',
    'Choose Different Existing Folder': '重新选择现有数据文件夹',
    'Choose Existing Folder': '选择现有数据文件夹',
    'Choose Different Folder': '重新选择文件夹',
    'Choose New Folder': '选择新文件夹',
    'Select the folder that already contains Readest data, or its parent folder.':
      '选择已经包含 Readest 数据的文件夹，或者它的上级文件夹。',
    'Use Existing Data': '使用现有数据',
    'Current Data Location': '当前数据位置',
    'File count: {{size}}': '文件数量：{{size}}',
    'Total size: {{size}}': '总大小：{{size}}',
    'Calculating file info...': '正在统计文件信息...',
    'Connecting existing data...': '正在连接现有数据...',
    'Migrating data...': '正在迁移数据...',
    'Copying: {{file}}': '正在复制：{{file}}',
    '{{current}} of {{total}} files': '第 {{current}} / {{total}} 个文件',
    'Existing data connected successfully!': '现有数据连接成功！',
    'Migration completed successfully!': '数据迁移完成！',
    'Your data has been moved to the new location. Please restart the application to complete the process.':
      '你的数据已经迁移到新位置。请重启应用以完成整个过程。',
    'Migration failed': '迁移失败',
    'Important Notice': '重要提示',
    'This will move all your app data to the new location. Make sure the destination has enough free space.':
      '这将把所有应用数据移动到新位置。请确认目标位置有足够的可用空间。',
    'Change Data Location': '更改数据位置',
    'Failed to select directory': '选择文件夹失败',
    'No compatible Readest data was found in the selected folder.':
      '在所选文件夹中没有找到兼容的 Readest 数据。',
    'The selected data location is already in use.': '所选数据位置已经在使用中。',
    'The new data directory must be different from the current one.':
      '新的数据目录不能与当前目录相同。',
    'Failed to use the selected data: {{error}}': '使用所选数据失败：{{error}}',
    'Migration failed: {{error}}': '迁移失败：{{error}}',
    'KiriReadest is independently maintained, based on OpenReadest and Readest.':
      'KiriReadest 基于 OpenReadest 和 Readest 开发，由本项目独立维护。',
    'KiriReadest modifications copyright (c) 2026 kiri603. OpenReadest modifications copyright (c) 2026 luyishui. Readest copyright Bilingify LLC and contributors.':
      'KiriReadest 修改部分版权 (c) 2026 kiri603。OpenReadest 修改部分版权 (c) 2026 luyishui。Readest 版权归 Bilingify LLC 及贡献者所有。',
    'Get Help from the Readest Community': '从 KiriReadest 社区获取帮助',
    'Need help? Contact our support team at support@readest.com':
      '需要帮助？请前往 KiriReadest 仓库提交 issue。',
    'Choose a new folder for KiriReadest to move its data into.':
      '为 KiriReadest 选择一个新的文件夹，用于迁移当前数据。',
    'KiriReadest will use the selected Readest data after restart. Please restart the application to complete the switch.':
      'KiriReadest 将在重启后使用所选的 Readest 数据。请重新启动应用以完成切换。',
    'This will switch KiriReadest to the selected Readest data location. Make sure you selected the library you want to continue using.':
      '这将把 KiriReadest 切换到所选的 Readest 数据位置。请确认你选择的是准备继续使用的书库。',
  },
  'zh-TW': {
    'Support KiriReadest': '支持 KiriReadest',
    'If KiriReadest helps you read and learn, you can support its continued development.':
      '如果 KiriReadest 幫助你閱讀與學習，歡迎支持專案的持續維護與開發。',
    'KiriReadest Alipay donation QR code': 'KiriReadest 支付寶捐贈收款碼',
    'Scan with Alipay, or select a saved image from your photos. Donations are optional.':
      '使用支付寶掃一掃，或儲存圖片後從相簿識別。捐贈完全自願。',
    'Save QR code': '儲存收款碼',
    'How to donate': '如何捐贈',
    'Take a screenshot, then open Alipay Scan and select it from your photos.':
      '請先截圖，再開啟支付寶掃一掃，從相簿選擇收款碼。',
    'Could not save the QR code. Please try again or take a screenshot.':
      '儲存收款碼失敗，請重試或直接截圖。',
    'Could not load the QR code. Please close this window and try again.':
      '收款碼載入失敗，請關閉視窗後重試。',
    License: '授權條款',
    'Project Links': '專案連結',
    'GitHub Homepage': 'GitHub 首頁',
    'Report an issue': '回報問題',
    检查更新: '檢查更新',
    'KiriReadest Update': 'KiriReadest Update',
    查看发布页: '查看發佈頁',
    '当前版本 {{version}}': '目前版本 {{version}}',
    '推荐分发通道：{{channel}}': '推薦分發通道：{{channel}}',
    'KiriReadest 的独立更新源正在接入中。当前阶段先保留独立“检查更新”页面，后续会接上远程版本信息、更新日志和下载分发。':
      'KiriReadest 的獨立更新來源正在接入中。現階段先保留獨立「檢查更新」頁面，後續會接上遠端版本資訊、更新日誌與下載分發。',
    '现在你可以先通过项目主页查看最新进展；Android 包会继续按 ARM64 优先提供。':
      '現在你可以先透過專案首頁查看最新進展；Android 套件會繼續以 ARM64 為優先。',
    '这里会同步 KiriReadest 的版本动向，也给你留好项目主页和最新版本入口。':
      '這裡會同步 KiriReadest 的版本動向，也把專案首頁與最新版本入口留給你。',
    '如果一时打不开或加载不出来，多半是 GitHub 网络波动，换个时间或者稍后再试就好。':
      '如果一時打不開或載入不出來，多半是 GitHub 網路波動，換個時間或稍後再試就好。',
    打开项目主页: '打開專案首頁',
    查看最新发布说明: '查看最新發佈說明',
    查看最新版本: '查看最新版本',
    使用系统文件管理器选择文件夹: '使用系統檔案管理器選擇資料夾',
    'Quick Select Common Folders': '常用目錄快速選擇',
    常用目录快速选择: '常用目錄快速選擇',
    'Move Current Data': '遷移目前資料',
    'Use Existing Readest Data': '使用現有 Readest 資料',
    'Existing Readest Data': '現有 Readest 資料',
    'New Data Location': '新的資料位置',
    'Choose Different Existing Folder': '重新選擇現有資料夾',
    'Choose Existing Folder': '選擇現有資料夾',
    'Choose Different Folder': '重新選擇資料夾',
    'Choose New Folder': '選擇新資料夾',
    'Select the folder that already contains Readest data, or its parent folder.':
      '選擇已經包含 Readest 資料的資料夾，或它的上層資料夾。',
    'Use Existing Data': '使用現有資料',
    'Current Data Location': '目前資料位置',
    'File count: {{size}}': '檔案數量：{{size}}',
    'Total size: {{size}}': '總大小：{{size}}',
    'Calculating file info...': '正在統計檔案資訊...',
    'Connecting existing data...': '正在連接現有資料...',
    'Migrating data...': '正在遷移資料...',
    'Copying: {{file}}': '正在複製：{{file}}',
    '{{current}} of {{total}} files': '第 {{current}} / {{total}} 個檔案',
    'Existing data connected successfully!': '現有資料連接成功！',
    'Migration completed successfully!': '資料遷移完成！',
    'Your data has been moved to the new location. Please restart the application to complete the process.':
      '你的資料已經移動到新位置。請重新啟動應用程式以完成整個流程。',
    'Migration failed': '遷移失敗',
    'Important Notice': '重要提示',
    'This will move all your app data to the new location. Make sure the destination has enough free space.':
      '這將把所有應用資料移動到新位置。請確認目標位置有足夠的可用空間。',
    'Change Data Location': '更改資料位置',
    'Failed to select directory': '選擇資料夾失敗',
    'No compatible Readest data was found in the selected folder.':
      '在所選資料夾中沒有找到相容的 Readest 資料。',
    'The selected data location is already in use.': '所選資料位置已經在使用中。',
    'The new data directory must be different from the current one.':
      '新的資料目錄不能與目前目錄相同。',
    'Failed to use the selected data: {{error}}': '使用所選資料失敗：{{error}}',
    'Migration failed: {{error}}': '遷移失敗：{{error}}',
    'KiriReadest is independently maintained, based on OpenReadest and Readest.':
      'KiriReadest 基於 OpenReadest 和 Readest 開發，由本專案獨立維護。',
    'KiriReadest modifications copyright (c) 2026 kiri603. OpenReadest modifications copyright (c) 2026 luyishui. Readest copyright Bilingify LLC and contributors.':
      'KiriReadest 修改部分版權 (c) 2026 kiri603。OpenReadest 修改部分版權 (c) 2026 luyishui。Readest 版權歸 Bilingify LLC 及貢獻者所有。',
    'Get Help from the Readest Community': '從 KiriReadest 社群獲取幫助',
    'Need help? Contact our support team at support@readest.com':
      '需要協助？請前往 KiriReadest 倉庫提交 issue。',
    'Choose a new folder for KiriReadest to move its data into.':
      '為 KiriReadest 選擇一個新的資料夾，用來遷移目前資料。',
    'KiriReadest will use the selected Readest data after restart. Please restart the application to complete the switch.':
      'KiriReadest 將在重新啟動後使用所選的 Readest 資料。請重新啟動應用程式以完成切換。',
    'This will switch KiriReadest to the selected Readest data location. Make sure you selected the library you want to continue using.':
      '這將把 KiriReadest 切換到所選的 Readest 資料位置。請確認你選擇的是準備繼續使用的書庫。',
  },
};

const resolveExplicitOverrides = (lng: string) => {
  if (EXPLICIT_OVERRIDES[lng]) {
    return EXPLICIT_OVERRIDES[lng]!;
  }

  if (lng === 'zh-HK') {
    return EXPLICIT_OVERRIDES['zh-TW']!;
  }

  return EXPLICIT_OVERRIDES['en']!;
};

export const applyOpenReadestTranslationOverrides = (instance: typeof i18n, lng: string) => {
  const bundle = instance.getResourceBundle(lng, 'translation');
  if (!bundle) {
    return;
  }

  const overrides: Record<string, string> = { ...resolveExplicitOverrides(lng) };

  for (const [targetKey, sourceKey] of Object.entries(BRAND_OVERRIDES)) {
    const sourceValue = bundle[sourceKey];
    if (typeof sourceValue === 'string' && sourceValue.trim()) {
      overrides[targetKey] = sourceValue.replaceAll('Readest', 'KiriReadest');
    }
  }

  instance.addResourceBundle(lng, 'translation', overrides, true, true);
};
