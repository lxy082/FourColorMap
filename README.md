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

## GitHub Pages 部署

本项目已提供 GitHub Actions 自动部署到 Pages。

1. 在仓库 Settings → Pages 中选择 **Build and deployment: GitHub Actions**。
2. 推送到 `main` 分支会自动构建并发布。
3. Pages 使用的 base 路径由环境变量注入（`BASE_PATH=/<repo>/`），无需手动改代码。

## Codespaces 开发与预览

```bash
npm install
npm run dev:codespace
```

然后在 **Ports** 面板打开 **5173**（Open in Browser）。

## 功能说明

- 随机地图模式：使用 Voronoi 生成分区地图，可调整区域数量。
- 四色约束校验、冲突高亮、目标色参考值与鼓励文案。
- 支持撤销/重做、重置确认与调试面板。
- 盘面支持缩放与平移（桌面按住空格拖动）。
