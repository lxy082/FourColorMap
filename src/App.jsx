import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { Routes, Route, Link, useNavigate } from 'react-router-dom';
import { Delaunay } from 'd3-delaunay';

const COLORS = [
  { name: '赤', hex: '#ef4444' },
  { name: '绿', hex: '#22c55e' },
  { name: '蓝', hex: '#3b82f6' },
  { name: '黄', hex: '#f59e0b' }
];

const MAP_WIDTH = 900;
const MAP_HEIGHT = 620;

const CLOSE_THRESHOLD = 20;
const MIN_POLYGON_AREA = 350;
const MIN_REGION_COUNT = 10;
const MAX_REGION_COUNT = 100;
const TARGET_SIMPLIFY_POINTS = 18;

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/four-color" element={<FourColorGame />} />
    </Routes>
  );
}

function Home() {
  return (
    <div className="page home">
      <div className="home-card">
        <h1>四色定理 · 地图填色挑战</h1>
        <p>
          这是一个轻量可玩的四色地图填色小游戏，支持随机出题与自己出题。
          点击进入开始挑战吧！
        </p>
        <Link className="primary" to="/four-color">
          进入游戏
        </Link>
      </div>
    </div>
  );
}

function FourColorGame() {
  const navigate = useNavigate();
  const [mode, setMode] = useState('random');
  const [regionCount, setRegionCount] = useState(30);
  const [isGenerating, setIsGenerating] = useState(false);
  const [regions, setRegions] = useState([]);
  const [adjacency, setAdjacency] = useState(new Map());
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
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState(null);

  const [customRegions, setCustomRegions] = useState([]);
  const [customEditing, setCustomEditing] = useState(true);
  const [drawingPoints, setDrawingPoints] = useState([]);
  const [drawingMessage, setDrawingMessage] = useState('');
  const [previewPolygon, setPreviewPolygon] = useState(null);
  const [previewMessage, setPreviewMessage] = useState('');
  const [lastCustomRegionId, setLastCustomRegionId] = useState('');
  const [isDrawing, setIsDrawing] = useState(false);
  const svgRef = useRef(null);

  const targetColor = COLORS[targetColorIndex];
  const isPlaying = mode === 'random' || !customEditing;

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

  const adjacencyEdgeCount = useMemo(() => {
    let count = 0;
    adjacency.forEach((neighbors) => {
      count += neighbors.size;
    });
    return Math.floor(count / 2);
  }, [adjacency]);

  const generateNewPuzzle = useCallback(() => {
    setIsGenerating(true);
    const targetIndex = Math.floor(Math.random() * COLORS.length);
    const count = clamp(Math.round(regionCount), MIN_REGION_COUNT, MAX_REGION_COUNT);
    const { regions: newRegions, adjacency: newAdjacency } = generateRandomMap(
      count,
      MAP_WIDTH,
      MAP_HEIGHT
    );
    const referenceCount = estimateTargetCount(newRegions, newAdjacency, targetIndex);

    setTargetColorIndex(targetIndex);
    setReferenceTargetCount(referenceCount);
    setRegions(newRegions);
    setAdjacency(newAdjacency);
    setSelectedId(null);
    setConflicts([]);
    setMessage('');
    setHistory([]);
    setRedoStack([]);
    setIsGenerating(false);
  }, [regionCount]);

  useEffect(() => {
    if (mode === 'random') {
      generateNewPuzzle();
    }
  }, [mode, generateNewPuzzle]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(''), 1600);
    return () => clearTimeout(timer);
  }, [toast]);

  const handleZoomChange = (nextZoom) => {
    const clamped = clamp(nextZoom, 1, 5);
    const center = { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 };
    const worldCenter = {
      x: (center.x - panOffset.x) / zoomLevel,
      y: (center.y - panOffset.y) / zoomLevel
    };
    const newOffset = {
      x: center.x - worldCenter.x * clamped,
      y: center.y - worldCenter.y * clamped
    };
    setZoomLevel(clamped);
    setPanOffset(newOffset);
  };

  const startCustomChallenge = useCallback(() => {
    const sanitized = customRegions.map((region) => ({
      ...region,
      color: null
    }));
    const newAdjacency = computeAdjacency(sanitized);
    const targetIndex = Math.floor(Math.random() * COLORS.length);
    const referenceCount = estimateTargetCount(sanitized, newAdjacency, targetIndex, 40);

    setRegions(sanitized);
    setAdjacency(newAdjacency);
    setTargetColorIndex(targetIndex);
    setReferenceTargetCount(referenceCount);
    setSelectedId(null);
    setConflicts([]);
    setMessage('');
    setHistory([]);
    setRedoStack([]);
    setCustomEditing(false);
  }, [customRegions]);

  const handleModeChange = (nextMode) => {
    setMode(nextMode);
    setSelectedId(null);
    setConflicts([]);
    setMessage('');
    setHistory([]);
    setRedoStack([]);
    if (nextMode === 'custom') {
      setCustomEditing(true);
      setRegions([]);
      setAdjacency(new Map());
      setPreviewPolygon(null);
      setPreviewMessage('');
      setLastCustomRegionId('');
    }
  };

  const handleRegionClick = (regionId) => {
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

  const handleNewPuzzle = () => {
    setShowNewModal(false);
    if (mode === 'random') {
      generateNewPuzzle();
    } else {
      setCustomEditing(true);
      setRegions([]);
      setAdjacency(new Map());
      setConflicts([]);
      setMessage('');
      setHistory([]);
      setRedoStack([]);
    }
  };

  const handlePointerDown = (event) => {
    if (event.button !== 0) return;
    const targetTag = event.target.tagName;
    const isBackground = targetTag === 'svg' || targetTag === 'rect';
    if (!isBackground) return;
    if (mode === 'custom' && customEditing && !event.shiftKey) {
      const point = getSvgPoint(event, svgRef.current, zoomLevel, panOffset);
      if (!point) return;
      setIsDrawing(true);
      setDrawingPoints([point]);
      setDrawingMessage('');
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    if (zoomLevel > 1) {
      const screenPoint = getSvgScreenPoint(event, svgRef.current);
      if (!screenPoint) return;
      setIsPanning(true);
      setPanStart({ point: screenPoint, offset: panOffset });
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  };

  const handlePointerMove = (event) => {
    if (isDrawing && mode === 'custom' && customEditing) {
      const point = getSvgPoint(event, svgRef.current, zoomLevel, panOffset);
      if (!point) return;
      setDrawingPoints((prev) => [...prev, point]);
      return;
    }
    if (isPanning && panStart) {
      const screenPoint = getSvgScreenPoint(event, svgRef.current);
      if (!screenPoint) return;
      const dx = screenPoint.x - panStart.point.x;
      const dy = screenPoint.y - panStart.point.y;
      setPanOffset({
        x: panStart.offset.x + dx,
        y: panStart.offset.y + dy
      });
    }
  };

  const handlePointerUp = (event) => {
    if (isDrawing && mode === 'custom' && customEditing) {
      const points = [...drawingPoints];
      setIsDrawing(false);
      setDrawingPoints([]);

      if (points.length < 3) return;

      const simplified = simplifyPath(points, 3);
      const fitted = fitToMaxPoints(simplified, TARGET_SIMPLIFY_POINTS);
      const snapThreshold = MAP_WIDTH * 0.012;
      const { polygon, message } = buildSnappedPolygon(fitted, customRegions, snapThreshold);
      if (!polygon) {
        setDrawingMessage(message || '形状不合法，请靠近已有边界绘制或画封闭区域。');
        return;
      }

      const area = Math.abs(polygonArea(polygon));
      if (area < MIN_POLYGON_AREA) {
        setDrawingMessage('区域太小，请重新绘制。');
        return;
      }

      setPreviewPolygon(polygon);
      setPreviewMessage('预览已生成，可确认或取消。');
    }
    if (isPanning) {
      setIsPanning(false);
      setPanStart(null);
    }
  };

  const handleConfirmPreview = () => {
    if (!previewPolygon) return;
    const regionId = `custom-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const region = {
      id: regionId,
      polygon: previewPolygon,
      color: null
    };
    setCustomRegions((prev) => [...prev, region]);
    setPreviewPolygon(null);
    setPreviewMessage('');
    setLastCustomRegionId(regionId);
  };

  const handleCancelPreview = () => {
    setPreviewPolygon(null);
    setPreviewMessage('已取消预览，请重新绘制。');
  };

  const handleDeleteCustomRegion = () => {
    if (!selectedId) return;
    setCustomRegions((prev) => prev.filter((region) => region.id !== selectedId));
    setSelectedId(null);
  };

  const handleClearCustom = () => {
    setCustomRegions([]);
    setSelectedId(null);
    setPreviewPolygon(null);
    setPreviewMessage('');
    setLastCustomRegionId('');
  };

  const activeRegions = mode === 'custom' && customEditing ? customRegions : regions;

  const renderPolygon = (region) => {
    const color = region.color == null ? 'transparent' : COLORS[region.color].hex;
    const isSelected = region.id === selectedId;
    const isConflict = conflictSet.has(region.id);
    const points = region.polygon.map((p) => `${p.x},${p.y}`).join(' ');
    return (
      <polygon
        key={region.id}
        points={points}
        fill={color}
        className={`region ${isSelected ? 'selected' : ''} ${isConflict ? 'conflict' : ''}`}
        onClick={() => handleRegionClick(region.id)}
      />
    );
  };

  const drawingPath = drawingPoints.length
    ? `M ${drawingPoints[0].x} ${drawingPoints[0].y} ${drawingPoints
        .slice(1)
        .map((p) => `L ${p.x} ${p.y}`)
        .join(' ')}`
    : '';

  return (
    <div className="page game">
      <header className="top-bar">
        <button className="ghost" onClick={() => navigate('/')}>返回首页</button>
        <h1>四色定理地图挑战</h1>
      </header>

      <div className="tabs">
        <button className={mode === 'random' ? 'active' : ''} onClick={() => handleModeChange('random')}>
          随机题
        </button>
        <button className={mode === 'custom' ? 'active' : ''} onClick={() => handleModeChange('custom')}>
          我来出题
        </button>
      </div>

      <div className="layout">
        <div className="map-panel">
          <svg
            ref={svgRef}
            className="map"
            viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            <g transform={`translate(${panOffset.x} ${panOffset.y}) scale(${zoomLevel})`}>
              <rect width={MAP_WIDTH} height={MAP_HEIGHT} className="map-bg" />
              {activeRegions.map(renderPolygon)}
              {previewPolygon && (
                <polygon
                  points={previewPolygon.map((p) => `${p.x},${p.y}`).join(' ')}
                  className="region preview"
                />
              )}
              {drawingPath && customEditing && (
                <path d={drawingPath} className="drawing-path" />
              )}
            </g>
          </svg>

          {mode === 'custom' && customEditing && (
            <div className="drawing-help">
              <strong>自定义出题：</strong>
              <span>按住并拖动绘制区域，抬起结束一笔；靠近已有边可吸附共边。放大后按住 Shift 拖拽平移。</span>
              {drawingMessage && <span className="warn">{drawingMessage}</span>}
              {previewMessage && <span className="info">{previewMessage}</span>}
              {previewPolygon && (
                <div className="button-row">
                  <button className="primary" onClick={handleConfirmPreview}>
                    确认生成
                  </button>
                  <button onClick={handleCancelPreview}>取消</button>
                </div>
              )}
            </div>
          )}
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

          {mode === 'random' && (
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
                  onChange={(event) => setRegionCount(clamp(Number(event.target.value), MIN_REGION_COUNT, MAX_REGION_COUNT))}
                />
              </div>
              <div className="muted">范围：{MIN_REGION_COUNT} - {MAX_REGION_COUNT}</div>
            </section>
          )}

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
            <div className="muted">放大后可在盘面空白处拖拽平移。</div>
          </section>

          {mode === 'custom' && customEditing && (
            <section className="panel-section">
              <h2>出题工具</h2>
              <div className="button-group">
                <button onClick={handleDeleteCustomRegion} disabled={!selectedId}>
                  删除选中
                </button>
                <button onClick={handleClearCustom} disabled={!customRegions.length}>
                  清空全部
                </button>
              </div>
              <button
                className="primary"
                onClick={startCustomChallenge}
                disabled={customRegions.length < 2}
              >
                开始填色挑战
              </button>
              {customRegions.length < 2 && (
                <div className="muted">至少需要 2 个区域才能开始挑战。</div>
              )}
            </section>
          )}

          {!customEditing && mode === 'custom' && (
            <section className="panel-section">
              <div className="muted">
                当前为自定义题目挑战。需要重新绘制请点击“生成新题”。
              </div>
            </section>
          )}

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
                    disabled={!isPlaying}
                  >
                    {color.name}
                  </button>
                ))}
                <button className="palette-color eraser" onClick={handleClearSelected} disabled={!isPlaying}>
                  清除
                </button>
              </div>
              <div className="button-row">
                <button onClick={handleUndo} disabled={!history.length || !isPlaying}>
                  撤销
                </button>
                <button onClick={handleRedo} disabled={!redoStack.length || !isPlaying}>
                  重做
                </button>
              </div>
            </section>

          <section className="panel-section">
            <h2>操作</h2>
            <div className="button-column">
              <button className="primary" onClick={handleCheck} disabled={!isPlaying || !regions.length || isGenerating}>
                {isGenerating ? '生成中...' : '检查/提交'}
              </button>
              <button onClick={() => setShowResetModal(true)} disabled={!isPlaying || !regions.length || isGenerating}>
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
            <summary>规则与背景</summary>
            <div className="rules">
              <p>
                <strong>四色定理</strong>指出：任何平面地图的相邻区域最多用四种颜色就能区分。
                本游戏的相邻定义为“共享一段边界”，不能只在一点相接。
                只要相邻不同色即可通关，目标色使用更少会获得额外鼓励。
              </p>
              <details>
                <summary>更多背景</summary>
                <p>四色定理强调平面区域的相邻关系只需要四种颜色即可区分，本游戏用它来挑战你的配色策略。</p>
              </details>
              <p>移动端建议横屏或使用盘面缩放滑条。</p>
            </div>
          </details>

          <details className="panel-section">
            <summary>调试面板</summary>
            <div className="debug">
              <div>区域数量：{activeRegions.length}</div>
              <div>相邻边数量：{adjacencyEdgeCount}</div>
              <div>当前目标色次数：{targetColorCount}</div>
              <div>最近冲突：{conflicts.map((pair) => pair.join(' ↔ ')).join(', ') || '无'}</div>
              {mode === 'custom' && customEditing && (
                <>
                  <div>自定义区域数：{customRegions.length}</div>
                  <div>预览中：{previewPolygon ? '是' : '否'}</div>
                  <div>最近区域 ID：{lastCustomRegionId || '无'}</div>
                </>
              )}
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

  const adjacency = new Map();
  regions.forEach((region) => {
    if (region) adjacency.set(region.id, new Set());
  });

  regions.forEach((region, index) => {
    if (!region) return;
    for (const neighbor of delaunay.neighbors(index)) {
      const neighborRegion = regions[neighbor];
      if (!neighborRegion) continue;
      adjacency.get(region.id)?.add(neighborRegion.id);
      adjacency.get(neighborRegion.id)?.add(region.id);
    }
  });

  return { regions: regions.filter(Boolean), adjacency };
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

function estimateTargetCount(regions, adjacency, targetIndex, iterations = 60) {
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

function computeAdjacency(regions) {
  const adjacency = new Map();
  regions.forEach((region) => adjacency.set(region.id, new Set()));

  for (let i = 0; i < regions.length; i += 1) {
    for (let j = i + 1; j < regions.length; j += 1) {
      const regionA = regions[i];
      const regionB = regions[j];
      const shared = sharedEdgeLength(regionA.polygon, regionB.polygon);
      if (shared > 8) {
        adjacency.get(regionA.id)?.add(regionB.id);
        adjacency.get(regionB.id)?.add(regionA.id);
      }
    }
  }
  return adjacency;
}

function sharedEdgeLength(polyA, polyB) {
  let total = 0;
  for (let i = 0; i < polyA.length; i += 1) {
    const a1 = polyA[i];
    const a2 = polyA[(i + 1) % polyA.length];
    for (let j = 0; j < polyB.length; j += 1) {
      const b1 = polyB[j];
      const b2 = polyB[(j + 1) % polyB.length];
      total += segmentOverlapLength(a1, a2, b1, b2);
      if (total > 8) return total;
    }
  }
  return total;
}

function segmentOverlapLength(a1, a2, b1, b2) {
  const v1 = { x: a2.x - a1.x, y: a2.y - a1.y };
  const v2 = { x: b2.x - b1.x, y: b2.y - b1.y };
  const len1 = Math.hypot(v1.x, v1.y);
  const len2 = Math.hypot(v2.x, v2.y);
  if (len1 < 1 || len2 < 1) return 0;

  const cross = Math.abs(v1.x * v2.y - v1.y * v2.x) / (len1 * len2);
  if (cross > 0.1) return 0;

  const distance = pointLineDistance(b1, a1, a2);
  if (distance > 3) return 0;

  const ux = v1.x / len1;
  const uy = v1.y / len1;
  const projA1 = a1.x * ux + a1.y * uy;
  const projA2 = a2.x * ux + a2.y * uy;
  const projB1 = b1.x * ux + b1.y * uy;
  const projB2 = b2.x * ux + b2.y * uy;

  const [minA, maxA] = projA1 < projA2 ? [projA1, projA2] : [projA2, projA1];
  const [minB, maxB] = projB1 < projB2 ? [projB1, projB2] : [projB2, projB1];
  const overlap = Math.min(maxA, maxB) - Math.max(minA, minB);
  return overlap > 0 ? overlap : 0;
}

function getSvgPoint(event, svg, scale, offset) {
  if (!svg) return null;
  const rect = svg.getBoundingClientRect();
  const scaleX = MAP_WIDTH / rect.width;
  const scaleY = MAP_HEIGHT / rect.height;
  const screenPoint = {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY
  };
  return {
    x: (screenPoint.x - offset.x) / scale,
    y: (screenPoint.y - offset.y) / scale
  };
}

function getSvgScreenPoint(event, svg) {
  if (!svg) return null;
  const rect = svg.getBoundingClientRect();
  const scaleX = MAP_WIDTH / rect.width;
  const scaleY = MAP_HEIGHT / rect.height;
  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY
  };
}

function simplifyPath(points, tolerance) {
  if (points.length < 3) return points;
  const first = points[0];
  const last = points[points.length - 1];
  let index = -1;
  let maxDistance = 0;

  for (let i = 1; i < points.length - 1; i += 1) {
    const d = pointLineDistance(points[i], first, last);
    if (d > maxDistance) {
      index = i;
      maxDistance = d;
    }
  }

  if (maxDistance > tolerance) {
    const left = simplifyPath(points.slice(0, index + 1), tolerance);
    const right = simplifyPath(points.slice(index), tolerance);
    return [...left.slice(0, -1), ...right];
  }

  return [first, last];
}

function closePath(points, threshold) {
  if (points.length < 3) return null;
  const start = points[0];
  const end = points[points.length - 1];
  const dist = Math.hypot(start.x - end.x, start.y - end.y);
  const closed = dist < threshold ? [...points.slice(0, -1)] : [...points, start];
  if (closed.length < 3) return null;
  return closed;
}

function buildSnappedPolygon(points, regions, threshold) {
  const edges = buildEdgeGraph(regions, threshold);
  const snappedPoints = snapPointsToEdges(points, edges, threshold);
  const start = snappedPoints[0];
  const end = snappedPoints[snappedPoints.length - 1];

  const { graph, nodes } = buildGraphFromEdges(edges, start, end, threshold);
  const startNode = findNearestNode(nodes, start, threshold);
  const endNode = findNearestNode(nodes, end, threshold);

  let path = null;
  if (startNode && endNode) {
    path = shortestPath(graph, startNode.id, endNode.id);
  }

  if (path && path.length > 1) {
    const pathPoints = path.map((nodeId) => nodes.get(nodeId)).reverse();
    const combined = mergePolyline(snappedPoints, pathPoints);
    return { polygon: combined, message: '' };
  }

  const closed = closePath(snappedPoints, CLOSE_THRESHOLD);
  if (!closed) {
    return { polygon: null, message: '形状不合法，请靠近已有边界绘制或画封闭区域。' };
  }
  return { polygon: closed, message: '' };
}

function buildEdgeGraph(regions, threshold) {
  const edges = [];
  regions.forEach((region) => {
    const poly = region.polygon;
    for (let i = 0; i < poly.length; i += 1) {
      const start = poly[i];
      const end = poly[(i + 1) % poly.length];
      if (distancePoints(start, end) > threshold / 2) {
        edges.push({ start, end });
      }
    }
  });
  return edges;
}

function snapPointsToEdges(points, edges, threshold) {
  if (!edges.length) return points;
  return points.map((point) => {
    let snapped = point;
    let minDist = threshold;
    edges.forEach((edge) => {
      const projection = projectPointToSegment(point, edge.start, edge.end);
      const dist = distancePoints(point, projection);
      if (dist < minDist) {
        minDist = dist;
        snapped = projection;
      }
    });
    return snapped;
  });
}

function buildGraphFromEdges(edges, startPoint, endPoint, threshold) {
  const nodes = new Map();
  const graph = new Map();

  const getNode = (point) => {
    const existing = findNearestNode(nodes, point, threshold);
    if (existing) return existing;
    const id = `node-${nodes.size}-${Math.random().toString(16).slice(2)}`;
    const node = { id, x: point.x, y: point.y };
    nodes.set(id, node);
    return node;
  };

  const connect = (a, b) => {
    if (!graph.has(a.id)) graph.set(a.id, new Map());
    if (!graph.has(b.id)) graph.set(b.id, new Map());
    const length = distancePoints(a, b);
    graph.get(a.id).set(b.id, length);
    graph.get(b.id).set(a.id, length);
  };

  edges.forEach((edge) => {
    const a = getNode(edge.start);
    const b = getNode(edge.end);
    connect(a, b);
  });

  const startNode = getNode(startPoint);
  const endNode = getNode(endPoint);
  const nearestStart = findNearestNode(nodes, startPoint, threshold);
  const nearestEnd = findNearestNode(nodes, endPoint, threshold);
  if (nearestStart && nearestStart.id !== startNode.id) connect(startNode, nearestStart);
  if (nearestEnd && nearestEnd.id !== endNode.id) connect(endNode, nearestEnd);

  return { graph, nodes };
}

function findNearestNode(nodes, point, threshold) {
  let result = null;
  nodes.forEach((node) => {
    if (distancePoints(node, point) < threshold) {
      result = node;
    }
  });
  return result;
}

function shortestPath(graph, startId, endId) {
  if (!graph.has(startId) || !graph.has(endId)) return null;
  const distances = new Map();
  const previous = new Map();
  const unvisited = new Set(graph.keys());
  graph.forEach((_, key) => distances.set(key, Infinity));
  distances.set(startId, 0);

  while (unvisited.size) {
    let current = null;
    let min = Infinity;
    unvisited.forEach((nodeId) => {
      const dist = distances.get(nodeId);
      if (dist < min) {
        min = dist;
        current = nodeId;
      }
    });
    if (!current) break;
    unvisited.delete(current);
    if (current === endId) break;
    const neighbors = graph.get(current) || new Map();
    neighbors.forEach((weight, neighborId) => {
      if (!unvisited.has(neighborId)) return;
      const alt = distances.get(current) + weight;
      if (alt < distances.get(neighborId)) {
        distances.set(neighborId, alt);
        previous.set(neighborId, current);
      }
    });
  }

  if (!previous.has(endId) && startId !== endId) return null;
  const path = [endId];
  let current = endId;
  while (current !== startId) {
    current = previous.get(current);
    if (!current) return null;
    path.push(current);
  }
  return path;
}

function mergePolyline(line, path) {
  const merged = [...line];
  const pathPoints = path.slice(1);
  pathPoints.forEach((point) => merged.push(point));
  return merged;
}

function projectPointToSegment(point, start, end) {
  const vx = end.x - start.x;
  const vy = end.y - start.y;
  const lenSq = vx * vx + vy * vy;
  if (lenSq === 0) return start;
  const t = ((point.x - start.x) * vx + (point.y - start.y) * vy) / lenSq;
  const clamped = Math.max(0, Math.min(1, t));
  return {
    x: start.x + clamped * vx,
    y: start.y + clamped * vy
  };
}

function fitToMaxPoints(points, targetCount) {
  if (points.length <= targetCount) return points;
  const step = Math.ceil(points.length / targetCount);
  const result = [];
  for (let i = 0; i < points.length; i += step) {
    result.push(points[i]);
  }
  if (result[result.length - 1] !== points[points.length - 1]) {
    result.push(points[points.length - 1]);
  }
  return result;
}

function distancePoints(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function polygonArea(points) {
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    area += p1.x * p2.y - p2.x * p1.y;
  }
  return area / 2;
}

function pointLineDistance(point, lineStart, lineEnd) {
  const { x, y } = point;
  const { x: x1, y: y1 } = lineStart;
  const { x: x2, y: y2 } = lineEnd;
  const A = x - x1;
  const B = y - y1;
  const C = x2 - x1;
  const D = y2 - y1;

  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  const param = lenSq !== 0 ? dot / lenSq : -1;
  let xx;
  let yy;

  if (param < 0) {
    xx = x1;
    yy = y1;
  } else if (param > 1) {
    xx = x2;
    yy = y2;
  } else {
    xx = x1 + param * C;
    yy = y1 + param * D;
  }

  const dx = x - xx;
  const dy = y - yy;
  return Math.hypot(dx, dy);
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
