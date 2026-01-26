# 四色定理地图挑战

一个基于 React + Vite 的网页版四色地图填色小游戏，支持随机出题与玩家自定义出题。

## 启动

```bash
npm install
npm run dev
```

访问地址：`http://localhost:5173`

主要页面：`/four-color`

## 部署（GitHub Pages / 子路径）

本项目是 Vite + React。生产环境需要先构建，并部署 `dist` 目录（不要直接部署 `index.html` + `src`）。如果部署在子路径（例如 `https://用户名.github.io/FourColorMap/`），请设置 `VITE_BASE_PATH`：

```bash
VITE_BASE_PATH=/FourColorMap/ npm run build
```

然后将 `dist` 目录发布到对应静态托管服务（GitHub Pages / Netlify / Vercel 静态目录）。

> 说明：本项目未在 PR 中包含 `favicon.ico`（二进制文件），部署时可自行在 public 目录添加。

## 功能说明

- 随机地图模式：使用 Voronoi 生成分区地图，可选择难度。
- 自定义出题：在画布上绘制闭合区域后进入填色挑战。
- 四色约束校验、冲突高亮、目标色参考值与鼓励文案。
- 支持撤销/重做、重置确认与调试面板。
