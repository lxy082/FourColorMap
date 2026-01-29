import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Delaunay } from 'd3-delaunay';

const COLORS = [
  { name: '赤', hex: '#ef4444' },
  { name: '绿', hex: '#22c55e' },
  { name: '蓝', hex: '#3b82f6' },
  { name: '黄', hex: '#f59e0b' }
];

const MAP_WIDTH = 900;
const MAP_HEIGHT = 620;

const MIN_REGION_COUNT = 10;
const MAX_REGION_COUNT = 200;
const PAN_THRESHOLD = 5;

function App() {
  return (
    <div className="page game">
      <FourColorGame />
    </div>
  );
}

function FourColorGame() {
  const [regionCount, setRegionCount] = useState(30);
  const [isGenerating, setIsGenerating] = useState(false);
  const [regions, setRegions] = useState([]);
  const [adjacency, setAdjacency] = useState(new Map());
  const [adjacencyMeta, setAdjacencyMeta] = useState(new Map());
  const [targetColorIndex, setTargetColorIndex] = useState(0);
  const [referenceTargetCount, setReferenceTargetCount] = useState(0);
  const [currentColor, setCurrentColor] = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  const [conflicts, setConflicts] = useState([]);
  const [message, setMessage] = useState('');
  const [history, setHistory] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [showResetModal, setShowResetModal] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);
  const [toast, setToast] = useState('');
  const [zoomLevel, setZoomLevel] = useState(1);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [baseScale, setBaseScale] = useState(1);
  const [colorLimit] = useState(COLORS.length);
  const [spacePressed, setSpacePressed] = useState(false);
  const [panEnabled, setPanEnabled] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [magnifierOn, setMagnifierOn] = useState(false);
  const [magnifierState, setMagnifierState] = useState({
    visible: false,
    x: 0,
    y: 0,
    worldX: 0,
    worldY: 0
  });

  const svgRef = useRef(null);
  const viewportRef = useRef(null);
  const prevBaseScaleRef = useRef(1);
  const dragState = useRef({
    active: false,
    startX: 0,
    startY: 0,
    scrollLeft: 0,
    scrollTop: 0
  });
  const suppressClickRef = useRef(false);
  const magnifierRadius = 110;
  const magnifierZoom = 2.6;
  const isZoomed = zoomLevel > 1;
  const showMagnifierDebug = magnifierOn;

  const targetColor = COLORS[targetColorIndex];

  const regionById = useMemo(() => {
    const map = new Map();
    regions.forEach((region) => map.set(region.id, region));
    return map;
  }, [regions]);

  const conflictSet = useMemo(() => {
    const set = new Set();
    conflicts.forEach((pair) => {
      set.add(pair[0]);
      set.add(pair[1]);
    });
    return set;
  }, [conflicts]);

  const targetColorCount = useMemo(() => {
    return regions.filter((region) => region.color === targetColorIndex).length;
  }, [regions, targetColorIndex]);

  const adjacencyEdgeCount = useMemo(() => adjacencyMeta.size, [adjacencyMeta]);

  const generateNewPuzzle = useCallback(() => {
    setIsGenerating(true);
    const targetIndex = Math.floor(Math.random() * COLORS.length);
    const count = clamp(Math.round(regionCount), MIN_REGION_COUNT, MAX_REGION_COUNT);
    const {
      regions: newRegions,
      adjacency: newAdjacency,
      adjacencyMeta: newAdjacencyMeta
    } = generateRandomMap(
      count,
      MAP_WIDTH,
      MAP_HEIGHT
    );
    const iterations = getGreedyIterations(count);
    const referenceCount = estimateTargetCount(newRegions, newAdjacency, targetIndex, iterations);

    setTargetColorIndex(targetIndex);
    setReferenceTargetCount(referenceCount);
    setRegions(newRegions);
    setAdjacency(newAdjacency);
    setAdjacencyMeta(newAdjacencyMeta);
    setSelectedId(null);
    setConflicts([]);
    setMessage('');
    setHistory([]);
    setRedoStack([]);
    setIsGenerating(false);
  }, [regionCount]);

  useEffect(() => {
    generateNewPuzzle();
  }, [generateNewPuzzle]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(''), 1600);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.code === 'Space') {
        event.preventDefault();
        setSpacePressed(true);
      }
    };
    const handleKeyUp = (event) => {
      if (event.code === 'Space') {
        event.preventDefault();
        setSpacePressed(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;
    const updateScale = () => {
      const rect = viewport.getBoundingClientRect();
      setViewportSize({ width: rect.width, height: rect.height });
      const nextScale = Math.min(rect.width / MAP_WIDTH, rect.height / MAP_HEIGHT) || 1;
      setBaseScale(nextScale);
    };
    updateScale();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateScale);
      return () => window.removeEventListener('resize', updateScale);
    }
    const observer = new ResizeObserver(updateScale);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const prevScale = prevBaseScaleRef.current;
    if (!prevScale || prevScale === baseScale) return;
    const centerX = (viewport.scrollLeft + viewport.clientWidth / 2) / (prevScale * zoomLevel);
    const centerY = (viewport.scrollTop + viewport.clientHeight / 2) / (prevScale * zoomLevel);
    prevBaseScaleRef.current = baseScale;
    requestAnimationFrame(() => {
      viewport.scrollLeft = centerX * baseScale * zoomLevel - viewport.clientWidth / 2;
      viewport.scrollTop = centerY * baseScale * zoomLevel - viewport.clientHeight / 2;
    });
  }, [baseScale, zoomLevel]);

  const handleZoomChange = (nextZoom) => {
    const clamped = clamp(nextZoom, 1, 5);
    const viewport = viewportRef.current;
    if (!viewport) {
      setZoomLevel(clamped);
      return;
    }
    const centerX = (viewport.scrollLeft + viewport.clientWidth / 2) / (baseScale * zoomLevel);
    const centerY = (viewport.scrollTop + viewport.clientHeight / 2) / (baseScale * zoomLevel);
    setZoomLevel(clamped);
    requestAnimationFrame(() => {
      if (clamped <= 1) {
        viewport.scrollLeft = 0;
        viewport.scrollTop = 0;
        return;
      }
      viewport.scrollLeft = centerX * baseScale * clamped - viewport.clientWidth / 2;
      viewport.scrollTop = centerY * baseScale * clamped - viewport.clientHeight / 2;
    });
  };

  const handleRegionClick = (regionId) => {
    if (magnifierOn) return;
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    setSelectedId(regionId);
  };

  const applyColorChange = (regionId, nextColor) => {
    setRegions((prev) =>
      prev.map((region) =>
        region.id === regionId
          ? {
              ...region,
              color: nextColor
            }
          : region
      )
    );
  };

  const applyPaletteColor = (nextColor) => {
    if (!selectedId) {
      setToast('请先选择一个区域');
      return;
    }
    const region = regionById.get(selectedId);
    if (!region) return;
    if (region.color === nextColor) return;
    setHistory((prev) => [...prev, { regionId: selectedId, prevColor: region.color, nextColor }]);
    setRedoStack([]);
    applyColorChange(selectedId, nextColor);
    setConflicts([]);
    setMessage('');
  };

  const handleClearSelected = () => {
    if (!selectedId) {
      setToast('请先选择一个区域');
      return;
    }
    const region = regionById.get(selectedId);
    if (!region || region.color == null) return;
    setHistory((prev) => [...prev, { regionId: selectedId, prevColor: region.color, nextColor: null }]);
    setRedoStack([]);
    applyColorChange(selectedId, null);
    setConflicts([]);
    setMessage('');
  };

  const handleUndo = () => {
    setHistory((prev) => {
      if (!prev.length) return prev;
      const next = [...prev];
      const last = next.pop();
      if (!last) return prev;
      setRedoStack((redoPrev) => [last, ...redoPrev]);
      applyColorChange(last.regionId, last.prevColor);
      return next;
    });
  };

  const handleRedo = () => {
    setRedoStack((prev) => {
      if (!prev.length) return prev;
      const [first, ...rest] = prev;
      if (first) {
        setHistory((histPrev) => [...histPrev, first]);
        applyColorChange(first.regionId, first.nextColor);
      }
      return rest;
    });
  };

  const handleCheck = () => {
    const conflictPairs = findConflicts(regions, adjacency);
    setConflicts(conflictPairs);
    const allFilled = regions.every((region) => region.color != null);

    if (conflictPairs.length > 0) {
      conflictPairs.forEach(([a, b]) => {
        const key = pairKey(a, b);
        const shared = adjacencyMeta.get(key);
        if (shared != null) {
          console.info(`Conflict ${a} ↔ ${b}, shared edge length=${shared.toFixed(2)}`);
        }
      });
      setMessage(`发现 ${conflictPairs.length} 处相邻同色冲突，请调整。`);
      return;
    }

    if (!allFilled) {
      setMessage('目前没有冲突，但还有未填色区域。');
      return;
    }

    const praise =
      targetColorCount <= referenceTargetCount
        ? '优秀：目标色控制得很好！'
        : '通关成功！继续挑战更少目标色吧。';

    setMessage(`满足四色条件，作答成功！${praise}`);
  };

  const handleReset = () => {
    setRegions((prev) => prev.map((region) => ({ ...region, color: null })));
    setHistory([]);
    setRedoStack([]);
    setConflicts([]);
    setMessage('');
    setShowResetModal(false);
  };

  const handleAutoColor = () => {
    const result = solveColoring(regions, adjacency, colorLimit);
    if (!result.success) {
      setMessage(`当前目标色数 ${colorLimit} 不可行，请尝试手动调整。`);
      return;
    }
    setRegions((prev) =>
      prev.map((region) => ({
        ...region,
        color: result.coloring.get(region.id) ?? null
      }))
    );
    setHistory([]);
    setRedoStack([]);
    setConflicts([]);
    setMessage(`已使用 ${colorLimit} 色生成推荐填色方案。`);
  };

  const handleNewPuzzle = () => {
    setShowNewModal(false);
    generateNewPuzzle();
  };

  const startDrag = (event) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    dragState.current = {
      active: true,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop
    };
    setIsDragging(true);
    suppressClickRef.current = false;
  };

  const handlePointerDown = (event) => {
    if (event.button !== 0) return;
    const shouldPan = spacePressed || (event.pointerType === 'touch' && panEnabled);
    if (!shouldPan) return;
    startDrag(event);
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    if (magnifierOn && event.pointerType === 'mouse') {
      const rect = viewport.getBoundingClientRect();
      const localX = event.clientX - rect.left;
      const localY = event.clientY - rect.top;
      const contentX = localX + viewport.scrollLeft;
      const contentY = localY + viewport.scrollTop;
      const svg = svgRef.current;
      const ctm = svg?.getScreenCTM();
      if (!ctm) return;
      const worldPoint = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse());
      const worldX = worldPoint.x;
      const worldY = worldPoint.y;
      const translateX = magnifierRadius - worldX * magnifierZoom;
      const translateY = magnifierRadius - worldY * magnifierZoom;
      console.info('Magnifier debug', {
        viewportRect: {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height
        },
        scrollLeft: viewport.scrollLeft,
        scrollTop: viewport.scrollTop,
        clientX: event.clientX,
        clientY: event.clientY,
        vx: localX,
        vy: localY,
        cx: contentX,
        cy: contentY,
        wx: worldX,
        wy: worldY,
        R: magnifierRadius,
        Z: magnifierZoom,
        tx: translateX,
        ty: translateY
      });
      setMagnifierState({
        visible: true,
        x: localX,
        y: localY,
        worldX,
        worldY
      });
    }
    if (!dragState.current.active) return;
    event.preventDefault();
    event.stopPropagation();
    const dx = event.clientX - dragState.current.startX;
    const dy = event.clientY - dragState.current.startY;
    if (Math.hypot(dx, dy) > PAN_THRESHOLD) {
      suppressClickRef.current = true;
    }
    viewport.scrollLeft = dragState.current.scrollLeft - dx;
    viewport.scrollTop = dragState.current.scrollTop - dy;
  };

  const handlePointerUp = () => {
    dragState.current.active = false;
    setIsDragging(false);
  };

  const handleTogglePan = () => {
    setPanEnabled((prev) => !prev);
  };

  const handleMagnifierToggle = () => {
    setMagnifierOn((prev) => !prev);
    setMagnifierState((prev) => ({ ...prev, visible: false }));
  };

  const handlePointerLeave = () => {
    handlePointerUp();
    setMagnifierState((prev) => ({ ...prev, visible: false }));
  };

  const renderPolygon = (region) => {
    const color = region.color == null ? 'transparent' : COLORS[region.color].hex;
    const isSelected = region.id === selectedId;
    const isConflict = conflictSet.has(region.id);
    const points = region.polygon.map((p) => `${p.x},${p.y}`).join(' ');
    return (
      <polygon
        key={region.id}
        points={points}
        fill="var(--fill-color)"
        style={{ '--fill-color': color }}
        className={`region ${isSelected ? 'selected' : ''} ${isConflict ? 'conflict-fill' : ''}`}
        onClick={() => handleRegionClick(region.id)}
      />
    );
  };

  return (
    <div>
      <header className="top-bar">
        <h1>四色定理地图挑战</h1>
      </header>

      <details className="panel-section info-panel">
        <summary>玩法说明与背景（点击展开）</summary>
        <div className="rules">
          <h3>四色定理的背景</h3>
          <p>
            四色定理研究的是“地图分区”如何用最少颜色区分相邻区域，它之所以重要，
            是因为它揭示了平面图的结构规律，也是图论中最著名的问题之一。
            证明它非常困难，因为可能的地图组合几乎无限，传统手算难以覆盖所有情况。
            最终证明依赖计算机辅助验证大量结构，成为数学史上首次被广泛认可的计算机辅助证明之一。
          </p>

          <h3>本游戏与四色定理的对应</h3>
          <ul>
            <li>地图由多个“区域”构成，每个区域是一块封闭的多边形。</li>
            <li>相邻定义：两块区域共享<strong>一段边界</strong>，仅在一个点相接不算相邻。</li>
            <li>四色定理保证：无论地图怎样分区，四种颜色足够完成相邻不同色。</li>
          </ul>

          <h3>游戏规则</h3>
          <ul>
            <li>点击区域选中，再点击色板即可填色；点击其他颜色可直接改色。</li>
            <li>点击“清除”可擦除当前区域颜色。</li>
            <li>检查时若有相邻同色会高亮冲突区域；全填色且无冲突即通关。</li>
            <li>目标颜色只是挑战：使用更少会得到鼓励，但不影响通关判定。</li>
            <li>参考值是启发式估计，不保证最优。</li>
          </ul>

          <h3>操作指南</h3>
          <ul>
            <li>桌面：点击区域后点颜色即可填色；按住空格拖动平移；滑条缩放盘面。</li>
            <li>移动端：使用滑条缩放盘面；点击“移动盘面”后单指拖动平移。</li>
          </ul>
        </div>
      </details>

      <div className="layout">
        <div className="map-panel">
          <div
            className={`map-viewport ${isDragging ? 'is-dragging' : ''} ${
              spacePressed || panEnabled ? 'pan-ready' : ''
            } ${magnifierOn ? 'magnifier-on' : ''} ${isZoomed ? 'zoomed' : 'fit'}`}
            ref={viewportRef}
            onPointerDownCapture={handlePointerDown}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerLeave}
            onPointerCancel={handlePointerUp}
          >
            <div
              className="map-content"
              style={{
                width: isZoomed ? viewportSize.width * zoomLevel : '100%',
                height: isZoomed ? viewportSize.height * zoomLevel : '100%'
              }}
            >
              <svg
                className="map"
                viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
                width={isZoomed ? viewportSize.width * zoomLevel : '100%'}
                height={isZoomed ? viewportSize.height * zoomLevel : '100%'}
                preserveAspectRatio="xMidYMid meet"
                ref={svgRef}
                onClickCapture={(event) => {
                  if (magnifierOn) {
                    event.preventDefault();
                    event.stopPropagation();
                    return;
                  }
                  if (suppressClickRef.current) {
                    suppressClickRef.current = false;
                    event.preventDefault();
                    event.stopPropagation();
                  }
                }}
              >
                <rect width={MAP_WIDTH} height={MAP_HEIGHT} className="map-bg" />
                {regions.map(renderPolygon)}
                {showMagnifierDebug && magnifierState.visible && (
                  <g className="magnifier-crosshair">
                    <line
                      x1={magnifierState.worldX - 6}
                      y1={magnifierState.worldY}
                      x2={magnifierState.worldX + 6}
                      y2={magnifierState.worldY}
                    />
                    <line
                      x1={magnifierState.worldX}
                      y1={magnifierState.worldY - 6}
                      x2={magnifierState.worldX}
                      y2={magnifierState.worldY + 6}
                    />
                  </g>
                )}
              </svg>
            </div>
            {magnifierOn && magnifierState.visible && (
              <div
                className="magnifier"
                style={{
                  width: magnifierRadius * 2,
                  height: magnifierRadius * 2,
                  transform: `translate(${magnifierState.x - magnifierRadius}px, ${
                    magnifierState.y - magnifierRadius
                  }px)`
                }}
              >
                <svg
                  className="magnifier-svg"
                  viewBox={`0 0 ${magnifierRadius * 2} ${magnifierRadius * 2}`}
                  width={magnifierRadius * 2}
                  height={magnifierRadius * 2}
                >
                  <g
                    transform={`translate(${magnifierRadius - magnifierState.worldX * magnifierZoom} ${
                      magnifierRadius - magnifierState.worldY * magnifierZoom
                    }) scale(${magnifierZoom})`}
                  >
                    <rect width={MAP_WIDTH} height={MAP_HEIGHT} className="map-bg" />
                    {regions.map(renderPolygon)}
                    {showMagnifierDebug && (
                      <g className="magnifier-crosshair">
                        <line
                          x1={magnifierState.worldX - 6}
                          y1={magnifierState.worldY}
                          x2={magnifierState.worldX + 6}
                          y2={magnifierState.worldY}
                        />
                        <line
                          x1={magnifierState.worldX}
                          y1={magnifierState.worldY - 6}
                          x2={magnifierState.worldX}
                          y2={magnifierState.worldY + 6}
                        />
                      </g>
                    )}
                  </g>
                </svg>
              </div>
            )}
          </div>
        </div>

        <aside className="control-panel">
          <section className="panel-section">
            <h2>目标色</h2>
            <div className="target-color">
              <span className="color-dot" style={{ background: targetColor?.hex }} />
              <div>
                <div>目标颜色：{targetColor?.name}</div>
                <div className="muted">参考最少次数：{referenceTargetCount}</div>
              </div>
            </div>
          </section>

          <section className="panel-section">
            <h2>区域数量</h2>
            <div className="range-row">
              <input
                type="range"
                min={MIN_REGION_COUNT}
                max={MAX_REGION_COUNT}
                value={regionCount}
                onChange={(event) => setRegionCount(Number(event.target.value))}
              />
              <input
                type="number"
                min={MIN_REGION_COUNT}
                max={MAX_REGION_COUNT}
                value={regionCount}
                onChange={(event) =>
                  setRegionCount(clamp(Number(event.target.value), MIN_REGION_COUNT, MAX_REGION_COUNT))
                }
              />
            </div>
            <div className="muted">范围：{MIN_REGION_COUNT} - {MAX_REGION_COUNT}</div>
          </section>

          <section className="panel-section">
            <h2>盘面缩放</h2>
            <div className="range-row">
              <input
                type="range"
                min={1}
                max={5}
                step={0.1}
                value={zoomLevel}
                onChange={(event) => handleZoomChange(Number(event.target.value))}
              />
              <div className="zoom-value">{Math.round(zoomLevel * 100)}%</div>
            </div>
            <div className="muted">桌面按住空格拖动平移，移动端开启“移动盘面”。</div>
          </section>

          <section className="panel-section">
            <h2>放大镜</h2>
            <button
              className={magnifierOn ? 'toggle active' : 'toggle'}
              onClick={handleMagnifierToggle}
            >
              {magnifierOn ? '🔍 放大镜：已开启' : '🔍 放大镜：关闭'}
            </button>
            {magnifierOn && <div className="muted">放大镜开启时仅观察，点击不会填色。</div>}
          </section>

          <section className="panel-section">
            <h2>移动端平移</h2>
            <button
              className={panEnabled ? 'toggle active' : 'toggle'}
              onClick={handleTogglePan}
            >
              {panEnabled ? '移动盘面：已开启' : '移动盘面：关闭'}
            </button>
          </section>

          <section className="panel-section">
            <h2>色板</h2>
            <div className="palette">
              {COLORS.map((color, index) => (
                <button
                  key={color.name}
                  className={currentColor === index ? 'palette-color active' : 'palette-color'}
                  style={{ background: color.hex }}
                  onClick={() => {
                    setCurrentColor(index);
                    applyPaletteColor(index);
                  }}
                  disabled={isGenerating}
                >
                  {color.name}
                </button>
              ))}
              <button className="palette-color eraser" onClick={handleClearSelected} disabled={isGenerating}>
                清除
              </button>
            </div>
            <div className="button-row">
              <button onClick={handleUndo} disabled={!history.length || isGenerating}>
                撤销
              </button>
              <button onClick={handleRedo} disabled={!redoStack.length || isGenerating}>
                重做
              </button>
            </div>
          </section>

          <section className="panel-section">
            <h2>操作</h2>
            <div className="button-column">
              <button className="primary" onClick={handleCheck} disabled={!regions.length || isGenerating}>
                {isGenerating ? '生成中...' : '检查/提交'}
              </button>
              <button onClick={handleAutoColor} disabled={!regions.length || isGenerating}>
                一键推荐填色（{colorLimit} 色）
              </button>
              <button onClick={() => setShowResetModal(true)} disabled={!regions.length || isGenerating}>
                重置本题
              </button>
              <button onClick={() => setShowNewModal(true)} disabled={isGenerating}>
                生成新题
              </button>
            </div>
            {message && <div className="message">{message}</div>}
            <div className="muted">目标色使用次数：{targetColorCount}</div>
          </section>

          <details className="panel-section">
            <summary>调试面板</summary>
            <div className="debug">
              <div>区域数量：{regions.length}</div>
              <div>相邻边数量：{adjacencyEdgeCount}</div>
              <div>当前目标色次数：{targetColorCount}</div>
              <div>最近冲突：{conflicts.map((pair) => pair.join(' ↔ ')).join(', ') || '无'}</div>
            </div>
          </details>
        </aside>
      </div>

      {showResetModal && (
        <Modal
          title="确定要重置吗？"
          content="当前作答将丢失。"
          onCancel={() => setShowResetModal(false)}
          onConfirm={handleReset}
        />
      )}

      {showNewModal && (
        <Modal
          title="要生成新题吗？"
          content="当前地图与作答将被替换。"
          onCancel={() => setShowNewModal(false)}
          onConfirm={handleNewPuzzle}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function Modal({ title, content, onCancel, onConfirm }) {
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h3>{title}</h3>
        <p>{content}</p>
        <div className="button-row">
          <button onClick={onCancel}>取消</button>
          <button className="primary" onClick={onConfirm}>
            确认
          </button>
        </div>
      </div>
    </div>
  );
}

function generateRandomMap(regionCount, width, height) {
  const points = createPoints(regionCount, width, height);
  const delaunay = Delaunay.from(points, (p) => p[0], (p) => p[1]);
  const voronoi = delaunay.voronoi([0, 0, width, height]);

  const regions = points.map((point, index) => {
    const polygon = voronoi.cellPolygon(index);
    if (!polygon) return null;
    const normalized = normalizePolygon(polygon).map((p) => ({
      x: clamp(p[0], 0, width),
      y: clamp(p[1], 0, height)
    }));
    return {
      id: `region-${index}`,
      polygon: normalized,
      color: null
    };
  });

  const filtered = regions.filter(Boolean);
  const { adjacency, adjacencyMeta } = buildAdjacencyFromEdges(filtered);
  validateAdjacency(adjacency);
  return { regions: filtered, adjacency, adjacencyMeta };
}

function createPoints(count, width, height) {
  const minDist = width / Math.sqrt(count) / 2.2;
  const points = [];
  let attempts = 0;
  while (points.length < count && attempts < count * 120) {
    const point = [
      randomRange(width * 0.05, width * 0.95),
      randomRange(height * 0.05, height * 0.95)
    ];
    const ok = points.every((p) => distance(p, point) > minDist);
    if (ok) points.push(point);
    attempts += 1;
  }
  while (points.length < count) {
    points.push([randomRange(0, width), randomRange(0, height)]);
  }
  return points;
}

function findConflicts(regions, adjacency) {
  const conflicts = [];
  const regionMap = new Map(regions.map((r) => [r.id, r]));
  adjacency.forEach((neighbors, regionId) => {
    const region = regionMap.get(regionId);
    if (!region || region.color == null) return;
    neighbors.forEach((neighborId) => {
      const neighbor = regionMap.get(neighborId);
      if (!neighbor || neighbor.color == null) return;
      if (regionId < neighborId && region.color === neighbor.color) {
        conflicts.push([regionId, neighborId]);
      }
    });
  });
  return conflicts;
}

function estimateTargetCount(regions, adjacency, targetIndex, iterations) {
  if (!regions.length) return 0;
  let best = Infinity;
  for (let i = 0; i < iterations; i += 1) {
    const order = shuffleArray(regions.map((r) => r.id));
    const colors = new Map();

    order.forEach((regionId) => {
      const used = new Set();
      adjacency.get(regionId)?.forEach((neighborId) => {
        const color = colors.get(neighborId);
        if (color != null) used.add(color);
      });
      const available = COLORS.map((_, index) => index).filter((index) => !used.has(index));
      if (!available.length) {
        colors.set(regionId, targetIndex);
        return;
      }
      const sorted = [...available].sort((a, b) => {
        const penaltyA = a === targetIndex ? 1 : 0;
        const penaltyB = b === targetIndex ? 1 : 0;
        return penaltyA - penaltyB;
      });
      colors.set(regionId, sorted[0]);
    });

    const targetCount = Array.from(colors.values()).filter((c) => c === targetIndex).length;
    best = Math.min(best, targetCount);
  }
  return Number.isFinite(best) ? best : 0;
}

function getGreedyIterations(regionCount) {
  if (regionCount <= 80) return 60;
  if (regionCount <= 140) return 40;
  return 25;
}

function buildAdjacencyFromEdges(regions) {
  const adjacency = new Map();
  const adjacencyMeta = new Map();
  const edgeMap = new Map();
  const quantize = (value, eps) => Math.round(value / eps) * eps;
  const eps = 0.5;
  const minSharedLen = 2;

  regions.forEach((region) => adjacency.set(region.id, new Set()));

  regions.forEach((region) => {
    const poly = region.polygon;
    for (let i = 0; i < poly.length; i += 1) {
      const start = poly[i];
      const end = poly[(i + 1) % poly.length];
      const length = Math.hypot(end.x - start.x, end.y - start.y);
      if (length < minSharedLen) continue;
      const a = { x: quantize(start.x, eps), y: quantize(start.y, eps) };
      const b = { x: quantize(end.x, eps), y: quantize(end.y, eps) };
      const key = edgeKey(a, b);
      if (!edgeMap.has(key)) {
        edgeMap.set(key, []);
      }
      edgeMap.get(key).push({ regionId: region.id, length });
    }
  });

  edgeMap.forEach((entries) => {
    if (entries.length < 2) return;
    for (let i = 0; i < entries.length; i += 1) {
      for (let j = i + 1; j < entries.length; j += 1) {
        const a = entries[i];
        const b = entries[j];
        if (a.regionId === b.regionId) continue;
        const sharedLen = Math.min(a.length, b.length);
        if (sharedLen <= minSharedLen) continue;
        adjacency.get(a.regionId)?.add(b.regionId);
        adjacency.get(b.regionId)?.add(a.regionId);
        const key = pairKey(a.regionId, b.regionId);
        const existing = adjacencyMeta.get(key);
        adjacencyMeta.set(key, existing ? Math.max(existing, sharedLen) : sharedLen);
      }
    }
  });

  return { adjacency, adjacencyMeta };
}

function validateAdjacency(adjacency) {
  adjacency.forEach((neighbors, regionId) => {
    if (neighbors.has(regionId)) {
      console.warn(`Adjacency contains self reference for ${regionId}`);
    }
    neighbors.forEach((neighborId) => {
      if (!adjacency.get(neighborId)?.has(regionId)) {
        console.warn(`Adjacency not symmetric for ${regionId} ↔ ${neighborId}`);
      }
    });
  });
}

function solveColoring(regions, adjacency, colorCount) {
  const regionIds = regions.map((region) => region.id);
  const colors = new Map();
  const neighborMap = new Map();
  const degreeMap = new Map();

  regionIds.forEach((id) => {
    const neighbors = adjacency.get(id) ? Array.from(adjacency.get(id)) : [];
    neighborMap.set(id, neighbors);
    degreeMap.set(id, neighbors.length);
  });

  const getSaturation = (id) => {
    const used = new Set();
    neighborMap.get(id)?.forEach((neighborId) => {
      const color = colors.get(neighborId);
      if (color != null) used.add(color);
    });
    return used;
  };

  const selectNext = () => {
    let best = null;
    let bestSat = -1;
    let bestDegree = -1;
    regionIds.forEach((id) => {
      if (colors.has(id)) return;
      const sat = getSaturation(id);
      const degree = degreeMap.get(id) ?? 0;
      if (
        best === null ||
        sat.size > bestSat ||
        (sat.size === bestSat && degree > bestDegree) ||
        (sat.size === bestSat && degree === bestDegree && id < best)
      ) {
        best = id;
        bestSat = sat.size;
        bestDegree = degree;
      }
    });
    return best;
  };

  const orderColors = (id) => {
    const used = getSaturation(id);
    const available = [];
    for (let c = 0; c < colorCount; c += 1) {
      if (!used.has(c)) available.push(c);
    }
    return available;
  };

  const backtrack = () => {
    if (colors.size === regionIds.length) return true;
    const id = selectNext();
    if (!id) return false;
    const choices = orderColors(id);
    for (const color of choices) {
      colors.set(id, color);
      if (backtrack()) return true;
      colors.delete(id);
    }
    return false;
  };

  const success = backtrack();
  return { success, coloring: colors };
}

function edgeKey(a, b) {
  const first = a.x < b.x || (a.x === b.x && a.y <= b.y) ? a : b;
  const second = first === a ? b : a;
  return `${first.x},${first.y}|${second.x},${second.y}`;
}

function pairKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function normalizePolygon(polygon) {
  const result = polygon.map(([x, y]) => [x, y]);
  if (result.length > 1) {
    const first = result[0];
    const last = result[result.length - 1];
    if (first[0] === last[0] && first[1] === last[1]) {
      result.pop();
    }
  }
  return result;
}

function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function distance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function shuffleArray(array) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export default App;
