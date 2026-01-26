# 四色定理地图挑战

一个基于 React + Vite 的网页版四色地图填色小游戏（随机题模式）。

## 本地开发

```bash
npm install
npm run dev
```

访问地址：`http://localhost:5173`

## 生产构建

```bash
npm run build
```

构建产物输出在 `dist/`。

## GitHub Pages 部署（必须使用 Actions）

> Pages 不能直接发布源码目录，否则会在浏览器请求 `/src/main.jsx` 导致 404 白屏。
> 必须使用 GitHub Actions 构建并发布 `dist/`。

1. 打开仓库 Settings → Pages。
2. 在 **Build and deployment** 中选择 **GitHub Actions**。
3. 推送到 `main` 分支会自动构建并发布。
4. Pages 使用的 base 路径由 workflow 注入（`BASE_PATH=/<repo>/`），无需手动改代码。
5. 若 Actions 报错 “Dependencies lock file is not found”，说明仓库没有 lock 文件，workflow 已改为 `npm install` 以避免该错误。

### 本地模拟 Pages 访问验证

```bash
BASE_PATH=/FourColorMap/ npm run build
npm run preview -- --host --port 4173
```

然后访问：`http://localhost:4173/FourColorMap/`，确认 Network 中加载的是 `/FourColorMap/assets/*.js`，而不是 `/src/main.jsx`。

## Codespaces 开发与预览

```bash
npm install
npm run dev:codespace
```

然后在 **Ports** 面板打开 **5173**（Open in Browser）。

## 功能说明

- 随机地图模式：使用 Voronoi 生成分区地图，可调整区域数量（10~200）。
- 四色约束校验、冲突高亮、目标色参考值与鼓励文案。
- 支持撤销/重做、重置确认与调试面板。
- 盘面支持缩放与平移：桌面按住空格拖动，移动端用“移动盘面”开关。
