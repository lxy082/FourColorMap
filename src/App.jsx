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

const DIFFICULTY_MAP = {
  easy: 30,
  medium: 50,
  hard: 100
};

const CLOSE_THRESHOLD = 20;
const MIN_POLYGON_AREA = 350;

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
  const [difficulty, setDifficulty] = useState('medium');
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

  const [customRegions, setCustomRegions] = useState([]);
  const [customEditing, setCustomEditing] = useState(true);
  const [drawingPoints, setDrawingPoints] = useState([]);
  const [drawingMessage, setDrawingMessage] = useState('');
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
    const targetIndex = Math.floor(Math.random() * COLORS.length);
    const count = DIFFICULTY_MAP[difficulty];
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
  }, [difficulty]);

  useEffect(() => {
    if (mode === 'random') {
      generateNewPuzzle();
    }
  }, [mode, difficulty, generateNewPuzzle]);

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

  const handleFillSelected = () => {
    if (!selectedId) return;
    const region = regionById.get(selectedId);
    if (!region) return;
    const nextColor = region.color === currentColor ? null : currentColor;
    setHistory((prev) => [...prev, { regionId: selectedId, prevColor: region.color, nextColor }]);
    setRedoStack([]);
    applyColorChange(selectedId, nextColor);
    setConflicts([]);
    setMessage('');
  };

  const handleClearSelected = () => {
    if (!selectedId) return;
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
    if (mode !== 'custom' || !customEditing) return;
    if (event.target.tagName !== 'svg' && event.target.tagName !== 'rect') return;
    const point = getSvgPoint(event, svgRef.current);
    if (!point) return;
    setIsDrawing(true);
    setDrawingPoints([point]);
    setDrawingMessage('');
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event) => {
    if (!isDrawing || mode !== 'custom' || !customEditing) return;
    const point = getSvgPoint(event, svgRef.current);
    if (!point) return;
    setDrawingPoints((prev) => [...prev, point]);
  };

  const handlePointerUp = (event) => {
    if (!isDrawing || mode !== 'custom' || !customEditing) return;
    const points = [...drawingPoints];
    setIsDrawing(false);
    setDrawingPoints([]);

    if (points.length < 3) return;

    const simplified = simplifyPath(points, 3);
    const closed = closePath(simplified, CLOSE_THRESHOLD);
    if (!closed) {
      setDrawingMessage('形状不合法，请重新绘制。');
      return;
    }

    const area = Math.abs(polygonArea(closed));
    if (area < MIN_POLYGON_AREA) {
      setDrawingMessage('区域太小，请重新绘制。');
      return;
    }

    const region = {
      id: `custom-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      polygon: closed,
      color: null
    };

    setCustomRegions((prev) => [...prev, region]);
  };

  const handleDeleteCustomRegion = () => {
    if (!selectedId) return;
    setCustomRegions((prev) => prev.filter((region) => region.id !== selectedId));
    setSelectedId(null);
  };

  const handleClearCustom = () => {
    setCustomRegions([]);
    setSelectedId(null);
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
            <rect width={MAP_WIDTH} height={MAP_HEIGHT} className="map-bg" />
            {activeRegions.map(renderPolygon)}
            {drawingPath && customEditing && (
              <path d={drawingPath} className="drawing-path" />
            )}
          </svg>

          {mode === 'custom' && customEditing && (
            <div className="drawing-help">
              <strong>自定义出题：</strong>
              <span>按住并拖动绘制闭合区域，抬起结束一笔。</span>
              {drawingMessage && <span className="warn">{drawingMessage}</span>}
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
              <h2>难度</h2>
              <div className="button-group">
                <button className={difficulty === 'easy' ? 'active' : ''} onClick={() => setDifficulty('easy')}>
                  简单
                </button>
                <button className={difficulty === 'medium' ? 'active' : ''} onClick={() => setDifficulty('medium')}>
                  中等
                </button>
                <button className={difficulty === 'hard' ? 'active' : ''} onClick={() => setDifficulty('hard')}>
                  困难
                </button>
              </div>
            </section>
          )}

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
                disabled={customRegions.length < 4}
              >
                开始填色挑战
              </button>
              {customRegions.length < 4 && (
                <div className="muted">至少绘制 4 个区域才更有挑战性。</div>
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
                  onClick={() => setCurrentColor(index)}
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
              <button className="primary" onClick={handleFillSelected} disabled={!selectedId || !isPlaying}>
                填色/切换
              </button>
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
              <button className="primary" onClick={handleCheck} disabled={!isPlaying || !regions.length}>
                检查/提交
              </button>
              <button onClick={() => setShowResetModal(true)} disabled={!isPlaying || !regions.length}>
                重置本题
              </button>
              <button onClick={() => setShowNewModal(true)}>生成新题</button>
            </div>
            {message && <div className="message">{message}</div>}
            <div className="muted">目标色使用次数：{targetColorCount}</div>
          </section>

          <details className="panel-section">
            <summary>规则与背景</summary>
            <div className="rules">
              <p>
                <strong>四色定理</strong>告诉我们：任何平面地图的相邻区域都可以用不超过四种颜色完成着色。
              </p>
              <ul>
                <li>四种颜色给地图区域上色，相邻区域不可同色。</li>
                <li>相邻定义：两块区域共享一段边界（不是仅在一个点相接）。</li>
                <li>目标颜色尽量少用，但不影响通关。</li>
              </ul>
              <p>
                操作说明：点击区域选中后，从色板选择颜色，再点击“填色/切换”即可。再次点击同色可清除。
                支持撤销/重做、重置与生成新题。
              </p>
              <p>移动端建议双指缩放，或横屏体验更佳。</p>
            </div>
          </details>

          <details className="panel-section">
            <summary>调试面板</summary>
            <div className="debug">
              <div>区域数量：{activeRegions.length}</div>
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

function getSvgPoint(event, svg) {
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
