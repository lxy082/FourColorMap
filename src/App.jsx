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
  const [spacePressed, setSpacePressed] = useState(false);
  const [panEnabled, setPanEnabled] = useState(false);

  const viewportRef = useRef(null);
  const dragState = useRef({ active: false, startX: 0, startY: 0, scrollLeft: 0, scrollTop: 0 });
  const suppressClickRef = useRef(false);

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
    const iterations = getGreedyIterations(count);
    const referenceCount = estimateTargetCount(newRegions, newAdjacency, targetIndex, iterations);

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

  const handleZoomChange = (nextZoom) => {
    const clamped = clamp(nextZoom, 1, 5);
    const viewport = viewportRef.current;
    if (!viewport) {
      setZoomLevel(clamped);
      return;
    }
    const centerX = (viewport.scrollLeft + viewport.clientWidth / 2) / zoomLevel;
    const centerY = (viewport.scrollTop + viewport.clientHeight / 2) / zoomLevel;
    setZoomLevel(clamped);
    requestAnimationFrame(() => {
      viewport.scrollLeft = centerX * clamped - viewport.clientWidth / 2;
      viewport.scrollTop = centerY * clamped - viewport.clientHeight / 2;
    });
  };

  const handleRegionClick = (regionId) => {
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
    suppressClickRef.current = false;
  };

  const handlePointerDown = (event) => {
    if (event.button !== 0) return;
    if (event.pointerType === 'touch' && panEnabled) {
      startDrag(event);
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    if (spacePressed) {
      startDrag(event);
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  };

  const handlePointerMove = (event) => {
    if (!dragState.current.active) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
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
  };

  const handleTogglePan = () => {
    setPanEnabled((prev) => !prev);
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
        fill={color}
        className={`region ${isSelected ? 'selected' : ''} ${isConflict ? 'conflict' : ''}`}
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
            className="map-viewport"
            ref={viewportRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            <div
              className="map-content"
              style={{
                width: MAP_WIDTH * zoomLevel,
                height: MAP_HEIGHT * zoomLevel
              }}
            >
              <svg
                className="map"
                viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
                width={MAP_WIDTH * zoomLevel}
                height={MAP_HEIGHT * zoomLevel}
              >
                <rect width={MAP_WIDTH} height={MAP_HEIGHT} className="map-bg" />
                {regions.map(renderPolygon)}
              </svg>
            </div>
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
