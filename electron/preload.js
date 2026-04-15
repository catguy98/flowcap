const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  saveFlow: (data) => ipcRenderer.invoke('save-flow', data),
  loadFlow: (data) => ipcRenderer.invoke('load-flow', data),
  startRecording: (data) => ipcRenderer.invoke('start-recording', data),
  selectImage: () => ipcRenderer.invoke('select-image'),
  selectHtmlFile: () => ipcRenderer.invoke('select-html-file'),
  selectFlowFile: () => ipcRenderer.invoke('select-flow-file'),
  renderPreviewState: (data) => ipcRenderer.invoke('render-preview-state', data),
  onProgress: (callback) => ipcRenderer.on('recording-progress', (event, msg) => callback(msg)),
  removeProgressListener: () => ipcRenderer.removeAllListeners('recording-progress'),
  closeWindow: () => ipcRenderer.send('close-window'),
  analyzeUrl: (url) => ipcRenderer.invoke('analyze-url', { url })
});
