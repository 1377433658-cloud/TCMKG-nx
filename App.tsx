import React, { useState, useEffect, useMemo, useRef } from 'react';
import ForceGraph from './components/ForceGraph';
import Dendrogram from './components/Dendrogram';
import { GraphData, GraphNode, GraphLink, RawEntity, RawRelation, DataTab, GraphConfig, GroupStyleMap, GroupStyle, AnalysisMode, AnalysisMetricType, AlgorithmType, AnalysisAlgoConfig, AssociationRuleResult, DendrogramNode, NodeShape } from './types';
import { generateCooccurrenceGraph, runAlgorithm } from './services/graphAnalysis';
import { TableCellsIcon, TrashIcon, AdjustmentsHorizontalIcon, SwatchIcon, MagnifyingGlassIcon, ChartBarIcon, ArrowPathIcon, InboxIcon, DocumentArrowUpIcon, PauseIcon, PlayIcon, BeakerIcon, EyeSlashIcon, PencilSquareIcon, XMarkIcon, CalculatorIcon, ShareIcon, QueueListIcon, UserGroupIcon, ChartPieIcon, Square2StackIcon, CameraIcon, CpuChipIcon, DocumentTextIcon, PlusCircleIcon } from '@heroicons/react/24/outline';
import * as d3 from 'd3';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

// --- DATA CONFIGURATION ---
const INITIAL_DATA = {
  entities: [
    { "type": "疾病", "name": "胸痹" },
    { "type": "疾病", "name": "冠状动脉粥样硬化性心脏病" },
    { "type": "症状", "name": "胸闷" },
    { "type": "症状", "name": "胸痛" },
    { "type": "证候", "name": "气虚血瘀证" },
    { "type": "中药", "name": "丹参" },
    { "type": "中药", "name": "三七" },
    { "type": "中药", "name": "黄芪" },
    { "type": "方剂", "name": "补阳还五汤" },
    { "type": "症状", "name": "心悸" },
    { "type": "症状", "name": "气短" },
    { "type": "中药", "name": "当归" },
    { "type": "中药", "name": "川芎" },
    { "type": "中药", "name": "地龙" }
  ] as RawEntity[],
  relations: [
    { "source": "冠状动脉粥样硬化性心脏病", "relation": "属于", "target": "胸痹" },
    { "source": "胸闷", "relation": "是症状", "target": "气虚血瘀证" },
    { "source": "胸痛", "relation": "是症状", "target": "气虚血瘀证" },
    { "source": "心悸", "relation": "是症状", "target": "气虚血瘀证" },
    { "source": "气短", "relation": "是症状", "target": "气虚血瘀证" },
    { "source": "丹参", "relation": "治疗", "target": "胸痹" },
    { "source": "补阳还五汤", "relation": "组成", "target": "黄芪" },
    { "source": "补阳还五汤", "relation": "组成", "target": "当归" },
    { "source": "补阳还五汤", "relation": "组成", "target": "川芎" },
    { "source": "补阳还五汤", "relation": "组成", "target": "地龙" },
    { "source": "补阳还五汤", "relation": "治疗", "target": "气虚血瘀证" },
    { "source": "丹参", "relation": "可以搭配", "target": "三七" },
    { "source": "气虚血瘀证", "relation": "包含", "target": "胸闷" },
    { "source": "气虚血瘀证", "relation": "包含", "target": "胸痛" },
    { "source": "补阳还五汤", "relation": "适用", "target": "气虚血瘀证" }
  ] as RawRelation[],
  styles: {} as GroupStyleMap
};

// Specified RGB Colors for initial mapping
// 疾病: rgb(234, 170, 96)
// 症状: rgb(230, 139, 129)
// 证候: rgb(183, 178, 208)
// 中药: rgb(125, 166, 198)
// 方剂: rgb(132, 195, 183)
const TYPE_COLOR_MAP: Record<string, string> = {
  "疾病": "rgb(234, 170, 96)",
  "症状": "rgb(230, 139, 129)",
  "证候": "rgb(183, 178, 208)",
  "中药": "rgb(125, 166, 198)",
  "方剂": "rgb(132, 195, 183)"
};

const DEFAULT_COLORS = Object.values(TYPE_COLOR_MAP);
const TABLEAU_COLORS = d3.schemeTableau10;

function App() {
  // --- Data State ---
  const [entities, setEntities] = useState<RawEntity[]>([...INITIAL_DATA.entities]);
  const [relations, setRelations] = useState<RawRelation[]>([...INITIAL_DATA.relations]);
  
  // --- UI State ---
  const [activeTab, setActiveTab] = useState<DataTab>(DataTab.MANUAL);
  const [lastGraphTab, setLastGraphTab] = useState<DataTab>(DataTab.MANUAL);
  
  const [selectedType, setSelectedType] = useState<string>("all");
  const [selectedEntityId, setSelectedEntityId] = useState<string>(""); 
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [expandedNodeIds, setExpandedNodeIds] = useState<string[]>([]);
  const [hiddenNodeIds, setHiddenNodeIds] = useState<Set<string>>(new Set());
  
  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{visible: boolean, x: number, y: number, nodeId: string | null}>({
    visible: false, x: 0, y: 0, nodeId: null
  });

  // Import State
  const [entityCsv, setEntityCsv] = useState<string>("");
  const [relationCsv, setRelationCsv] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState<'entity' | 'relation' | null>(null);

  // Graph Config
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [graphKey, setGraphKey] = useState(0);
  
  const [graphConfig, setGraphConfig] = useState<GraphConfig>({
    chargeStrength: -300,
    linkDistance: 100,
    collideStrength: 35,
    layoutMode: 'force',
    isDirected: true,
    linkColor: "#9ca3af",
    enablePhysics: true
  });

  const [groupStyles, setGroupStyles] = useState<GroupStyleMap>({...INITIAL_DATA.styles});
  const [analysisStyles, setAnalysisStyles] = useState<Record<string, string>>({});

  // --- ANALYSIS STATE ---
  const [activeAlgorithm, setActiveAlgorithm] = useState<AlgorithmType | null>(null);
  
  // Algo Results Storage
  const [dendrogramData, setDendrogramData] = useState<DendrogramNode | null>(null);
  const [assocRules, setAssocRules] = useState<AssociationRuleResult[]>([]);
  const [centralityRankings, setCentralityRankings] = useState<{degree: any[], betweenness: any[], closeness: any[]} | null>(null);

  // Algo Configs
  const [algoConfig, setAlgoConfig] = useState<AnalysisAlgoConfig>({
    hierarchical: { k: 3, distanceType: 'euclidean', method: 'complete', orientation: 'horizontal', containerType: '证候', itemType: '症状' },
    kmeans: { k: 3, targetType: '中药' },
    community: { frontType: '症状', backType: '方剂', resolution: 1.0 },
    association: { frontType: '症状', backType: '方剂', minSupport: 0.1, minConfidence: 0.5 },
    backbone: { threshold: 0, metric: 'weight' },
    complexNetwork: { containerType: '证候', itemType: '症状' }
  });
  
  // Visual Mappings
  const [sizeMetric, setSizeMetric] = useState<AnalysisMetricType>('degree');
  const [colorSource, setColorSource] = useState<'community' | 'kCore' | 'kmeans' | 'hierarchical' | 'none'>('community');

  // --- Initialize Colors ---
  useEffect(() => {
    const types = Array.from(new Set(INITIAL_DATA.entities.map(e => e.type)));
    const initialStyles: GroupStyleMap = {};
    types.forEach((t, i) => {
      // Use predefined map if exists, otherwise cycle through custom palette
      const color = TYPE_COLOR_MAP[t] || DEFAULT_COLORS[i % DEFAULT_COLORS.length];
      initialStyles[t] = {
        color: color,
        shape: 'circle'
      };
    });
    setGroupStyles(prev => ({...initialStyles, ...prev}));
  }, []);

  // --- Graphs ---
  // 1. Standard Manual Graph
  const standardGraphData: GraphData = useMemo(() => {
    const uniqueNodesMap = new Map<string, GraphNode>();
    entities.forEach(e => { uniqueNodesMap.set(e.name, { id: e.name, group: e.type }); });
    relations.forEach(r => {
      if (!uniqueNodesMap.has(r.source)) uniqueNodesMap.set(r.source, { id: r.source, group: "未定义" });
      if (!uniqueNodesMap.has(r.target)) uniqueNodesMap.set(r.target, { id: r.target, group: "未定义" });
    });
    const nodes = Array.from(uniqueNodesMap.values());
    const links: GraphLink[] = relations.map(r => ({
      source: r.source, target: r.target, type: r.relation
    })).filter(l => uniqueNodesMap.has(l.source as string) && uniqueNodesMap.has(l.target as string));
    return { nodes, links };
  }, [entities, relations]);

  // 2. Analysis Graph (Dynamic based on algo)
  const analysisGraphData: GraphData | null = useMemo(() => {
    if (!activeAlgorithm) return null;

    let data: GraphData = { nodes: [], links: [] };

    if (activeAlgorithm === AlgorithmType.COMPLEX_NETWORK) {
        data = generateCooccurrenceGraph(entities, relations, algoConfig.complexNetwork.containerType, algoConfig.complexNetwork.itemType); 
    } 
    else if (activeAlgorithm === AlgorithmType.HIERARCHICAL) {
        data = generateCooccurrenceGraph(entities, relations, algoConfig.hierarchical.containerType, algoConfig.hierarchical.itemType); 
    }
    else if (activeAlgorithm === AlgorithmType.COMMUNITY) {
        const res = runAlgorithm('COMMUNITY', {nodes:[], links:[]}, algoConfig.community, {entities, relations}) as { nodes: GraphNode[], links: GraphLink[] };
        data = { nodes: res.nodes, links: res.links };
    }
    else if (activeAlgorithm === AlgorithmType.ASSOCIATION) {
        const res = runAlgorithm('ASSOCIATION', {nodes:[], links:[]}, algoConfig.association, {entities, relations}) as { nodes: GraphNode[], links: GraphLink[] };
        data = { nodes: res.nodes, links: res.links };
    }
    else if (activeAlgorithm === AlgorithmType.KMEANS) {
        const res = runAlgorithm('KMEANS', {nodes:[], links:[]}, algoConfig.kmeans, {entities, relations}) as { nodes: GraphNode[] };
        data = { nodes: res.nodes || [], links: [] };
    }

    if (activeAlgorithm === AlgorithmType.COMPLEX_NETWORK && algoConfig.backbone.threshold > 0) {
       if(data.links.length > 0) {
         data.links = data.links.filter(l => (l.weight || 0) >= algoConfig.backbone.threshold);
       }
    }

    if (data.nodes.length > 0) {
      const metrics = data.nodes.map(n => n.metrics?.[sizeMetric] || 0);
      const minVal = Math.min(...metrics);
      const maxVal = Math.max(...metrics);
      const sizeScale = d3.scaleLinear().domain([minVal, maxVal]).range([10, 30]);

      data.nodes.forEach(n => {
        const val = n.metrics?.[sizeMetric] || 0;
        n._radius = sizeMetric === 'none' ? 12 : sizeScale(val);

        let colorKey = "";
        if (colorSource === 'none') {
           n._color = "#cccccc";
        } else {
           if (colorSource === 'community') colorKey = `C${n.metrics?.community}`;
           else if (colorSource === 'kmeans') colorKey = `KM${n.clusters?.kmeans}`;
           else if (activeAlgorithm === AlgorithmType.ASSOCIATION) colorKey = n.group;
           else if (activeAlgorithm === AlgorithmType.COMPLEX_NETWORK) colorKey = `Core${n.metrics?.kCore}`;
           
           if (analysisStyles[colorKey]) {
             n._color = analysisStyles[colorKey];
           } else {
             const ordinal = d3.scaleOrdinal(TABLEAU_COLORS);
             n._color = ordinal(colorKey);
           }
           n.group = colorKey; 
        }
      });
    }

    return data;
  }, [entities, relations, activeAlgorithm, algoConfig, sizeMetric, colorSource, analysisStyles]);


  // Handle Algorithm Execution
  const handleRunAlgorithm = () => {
    if (!analysisGraphData && activeAlgorithm !== AlgorithmType.HIERARCHICAL) return;

    if (activeAlgorithm === AlgorithmType.HIERARCHICAL) {
        const baseData = generateCooccurrenceGraph(entities, relations, algoConfig.hierarchical.containerType, algoConfig.hierarchical.itemType); 
        const res = runAlgorithm('HIERARCHICAL', baseData, algoConfig.hierarchical) as { tree: DendrogramNode };
        setDendrogramData(res.tree);
    } 
    else if (activeAlgorithm === AlgorithmType.CENTRALITY) {
        if (!analysisGraphData) return;
        const ranks = runAlgorithm('CENTRALITY', analysisGraphData, {}) as {degree: any[], betweenness: any[], closeness: any[]};
        setCentralityRankings(ranks);
    }
    setGraphKey(prev => prev + 1);
  };

  // Sync Analysis Styles
  useEffect(() => {
    if (analysisGraphData && colorSource !== 'none') {
        const keys = new Set(analysisGraphData.nodes.map(n => n.group));
        setAnalysisStyles(prev => {
           const next = {...prev};
           let changed = false;
           keys.forEach(k => {
              if(!next[k]) {
                 const node = analysisGraphData.nodes.find(n => n.group === k);
                 if (node && node._color) { next[k] = node._color; changed = true; }
              }
           });
           return changed ? next : prev;
        });
    }
  }, [analysisGraphData, colorSource]);

  // --- Active Graph Logic ---
  const isShowingAnalysis = (activeTab === DataTab.ANALYSIS || (activeTab === DataTab.STYLE && lastGraphTab === DataTab.ANALYSIS)) && activeAlgorithm !== null;
  
  const activeGraphData = useMemo(() => {
    if (isShowingAnalysis && analysisGraphData) return analysisGraphData;

    // --- MANUAL GRAPH FILTERING ---
    let filteredNodes = standardGraphData.nodes.filter(n => !hiddenNodeIds.has(n.id));

    // Case 1: If "Expanded IDs" exist, we use Additive Logic (Show expanded nodes + whatever else is selected)
    // Actually, common requirement is: Show what matches filter, OR what is expanded.
    // If we double click a node, we want to SEE it and its neighbors. 
    if (expandedNodeIds.length > 0) {
        // If expansion is active, we prioritize showing these nodes.
        // We might want to intersect or union. Usually union with current filter is confusing.
        // Let's say: If expanded set exists, show that set. 
        filteredNodes = standardGraphData.nodes.filter(n => expandedNodeIds.includes(n.id) && !hiddenNodeIds.has(n.id));
    } else {
        // Case 2: Standard Filter by Type
        if (selectedType !== 'all') {
            filteredNodes = filteredNodes.filter(n => n.group === selectedType);
        }
        // Case 3: Standard Filter by Entity ID (Dropdown)
        if (selectedEntityId) {
             filteredNodes = filteredNodes.filter(n => n.id === selectedEntityId);
        }
    }
    
    const visibleIds = new Set(filteredNodes.map(n => n.id));
    
    // Filter Links: Both ends must be visible
    const links = standardGraphData.links.filter(l => {
       const s = typeof l.source === 'object' ? (l.source as GraphNode).id : l.source as string;
       const t = typeof l.target === 'object' ? (l.target as GraphNode).id : l.target as string;
       return visibleIds.has(s) && visibleIds.has(t);
    });
    return { nodes: filteredNodes, links };
  }, [standardGraphData, analysisGraphData, isShowingAnalysis, hiddenNodeIds, selectedType, selectedEntityId, expandedNodeIds]);

  // Available Types and Entities for Dropdowns
  const availableTypes = useMemo(() => ["all", ...Array.from(new Set(standardGraphData.nodes.map(n => n.group)))], [standardGraphData]);
  
  const availableEntities = useMemo(() => {
      if (selectedType === 'all') return [];
      return standardGraphData.nodes.filter(n => n.group === selectedType).map(n => n.id);
  }, [selectedType, standardGraphData]);

  // --- Handlers ---
  const handleNodeDoubleClick = (node: GraphNode) => {
      if (isShowingAnalysis) return;

      // Logic: Add node + its neighbors to the visible set (expandedNodeIds)
      // 1. Determine currently visible nodes (if any expansion exists, use that. If 'all', start fresh?)
      // If we are in 'all' mode with no specific expansion, we effectively have all nodes. 
      // If we double click in 'all' mode, maybe we want to isolate? 
      // Requirement says: "expand connected nodes... preserve current pattern"
      // This implies Additive.
      
      const currentVisibleIds = new Set(expandedNodeIds.length > 0 ? expandedNodeIds : activeGraphData.nodes.map(n=>n.id));
      
      // 2. Find neighbors in full dataset
      const neighbors = new Set<string>();
      standardGraphData.links.forEach(l => {
          const s = typeof l.source === 'object' ? (l.source as GraphNode).id : l.source as string;
          const t = typeof l.target === 'object' ? (l.target as GraphNode).id : l.target as string;
          if (s === node.id) neighbors.add(t);
          if (t === node.id) neighbors.add(s);
      });

      // 3. Merge
      const newExpanded = Array.from(new Set([...currentVisibleIds, ...neighbors, node.id]));
      
      // 4. Update state
      setExpandedNodeIds(newExpanded);
      // Ensure filters don't hide them
      if (selectedType !== 'all') setSelectedType('all');
      setSelectedEntityId(""); 
  };

  const handleEntitySelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const id = e.target.value;
      setSelectedEntityId(id);
      setExpandedNodeIds([]); // Reset expansion when specifically selecting via dropdown
  };

  const toggleAlgorithm = (algo: AlgorithmType) => {
      if (activeAlgorithm === algo) {
          setActiveAlgorithm(null); // Toggle Off
      } else {
          setActiveAlgorithm(algo); // Toggle On
      }
  };

  const handleExportPDF = async () => {
    const element = document.getElementById('analysis-dashboard');
    if (!element) return;
    try {
      const canvas = await html2canvas(element, { scale: 2, useCORS: true });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save('analysis_report.pdf');
    } catch (e) {
      console.error("PDF Export failed", e);
      alert("导出失败，请检查浏览器控制台");
    }
  };

  // Import File Handling
  const triggerFileUpload = (target: 'entity' | 'relation') => {
      setUploadTarget(target);
      fileInputRef.current?.click();
  };

  const handleFileRead = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
          const text = evt.target?.result as string;
          if (uploadTarget === 'entity') setEntityCsv(text);
          if (uploadTarget === 'relation') setRelationCsv(text);
          setUploadTarget(null);
          if(fileInputRef.current) fileInputRef.current.value = ''; // reset
      };
      reader.readAsText(file);
  };

  const handleBatchImport = () => {
    let addedE = 0;
    let addedR = 0;

    // Process Entities
    if (entityCsv.trim()) {
        const lines = entityCsv.trim().split('\n');
        const newEntities: RawEntity[] = [];
        // Skip header i=1
        for(let i=1; i<lines.length; i++) {
          const line = lines[i].trim();
          if(!line) continue;
          const parts = line.split(/[,，]/);
          if (parts.length >= 2) newEntities.push({ type: parts[0].trim(), name: parts[1].trim() });
        }
        if (newEntities.length > 0) {
            setEntities(prev => [...prev, ...newEntities]);
            addedE = newEntities.length;
        }
    }

    // Process Relations
    if (relationCsv.trim()) {
        const lines = relationCsv.trim().split('\n');
        const newRelations: RawRelation[] = [];
        // Skip header i=1
        for(let i=1; i<lines.length; i++) {
          const line = lines[i].trim();
          if(!line) continue;
          const parts = line.split(/[,，]/);
          if (parts.length >= 3) newRelations.push({ source: parts[0].trim(), relation: parts[1].trim(), target: parts[2].trim() });
        }
        if (newRelations.length > 0) {
            setRelations(prev => [...prev, ...newRelations]);
            addedR = newRelations.length;
        }
    }

    if (addedE > 0 || addedR > 0) {
        setEntityCsv("");
        setRelationCsv("");
        alert(`成功导入: ${addedE} 个实体, ${addedR} 条关系`);
    } else {
        alert("未发现有效数据 (请确保CSV包含表头且不为空)");
    }
  };

  const resetView = () => { setExpandedNodeIds([]); setSelectedType("all"); setSelectedEntityId(""); setSearchQuery(""); setHiddenNodeIds(new Set()); };
  const clearGraph = () => { setEntities([]); setRelations([]); };
  const handleNodeContextMenu = (event: MouseEvent, node: GraphNode) => { setContextMenu({ visible: true, x: event.pageX, y: event.pageY, nodeId: node.id }); };

  return (
    <div className="flex h-screen w-full bg-gray-50 text-gray-800 font-sans flex-col overflow-hidden">
      {/* Hidden File Input */}
      <input type="file" ref={fileInputRef} className="hidden" accept=".csv,.txt" onChange={handleFileRead} />

      {/* Top Nav */}
      <div className="bg-white border-b border-gray-200 p-2 px-4 shadow-sm flex items-center justify-between h-14 shrink-0 z-20">
         <h1 className="text-lg font-bold text-emerald-800 flex items-center gap-2">
            <BeakerIcon className="w-6 h-6"/> 湖中医知识图谱DEMO
         </h1>
         <div className="flex items-center gap-2">
            {/* Filter 1: Type */}
            <select className="text-sm border rounded p-1" value={selectedType} onChange={e => { setSelectedType(e.target.value); setSelectedEntityId(""); setExpandedNodeIds([]); }} disabled={isShowingAnalysis}>
              <option value="all">所有类型</option>
              {availableTypes.filter(t=>t!=='all').map(t=><option key={t} value={t}>{t}</option>)}
            </select>
            
            {/* Filter 2: Entity Name (Restored) */}
            <select className="text-sm border rounded p-1 max-w-[150px]" value={selectedEntityId} onChange={handleEntitySelect} disabled={isShowingAnalysis || selectedType === 'all'}>
               <option value="">选择实体...</option>
               {availableEntities.map(e => <option key={e} value={e}>{e}</option>)}
            </select>

            <button onClick={resetView} title="重置视图"><ArrowPathIcon className="w-5 h-5 text-gray-500"/></button>
         </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-64 bg-white border-r flex flex-col shadow z-10">
           <div className="flex border-b">
             <button onClick={() => {setActiveTab(DataTab.MANUAL); setLastGraphTab(DataTab.MANUAL)}} className={`flex-1 py-3 text-xs font-bold ${activeTab===DataTab.MANUAL?'text-emerald-600 border-b-2 border-emerald-500':'text-gray-500'}`}>概览</button>
             <button onClick={() => setActiveTab(DataTab.IMPORT)} className={`flex-1 py-3 text-xs font-bold ${activeTab===DataTab.IMPORT?'text-emerald-600 border-b-2 border-emerald-500':'text-gray-500'}`}>导入</button>
             <button onClick={() => setActiveTab(DataTab.STYLE)} className={`flex-1 py-3 text-xs font-bold ${activeTab===DataTab.STYLE?'text-emerald-600 border-b-2 border-emerald-500':'text-gray-500'}`}>样式</button>
             <button onClick={() => {setActiveTab(DataTab.ANALYSIS); setLastGraphTab(DataTab.ANALYSIS)}} className={`flex-1 py-3 text-xs font-bold ${activeTab===DataTab.ANALYSIS?'text-emerald-600 border-b-2 border-emerald-500':'text-gray-500'}`}>分析</button>
           </div>
           
           <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
              {/* MANUAL SIDEBAR */}
              {activeTab === DataTab.MANUAL && (
                  <div className="space-y-4">
                      <div className="bg-emerald-50 p-3 rounded text-xs text-emerald-800 border border-emerald-100">
                          欢迎使用湖中医知识图谱 DEMO。双击节点展开连接，右键节点更多选项。
                      </div>
                      <div>
                          <label className="text-xs font-bold block mb-1">搜索节点</label>
                          <div className="flex gap-1">
                              <input className="border rounded px-2 py-1 w-full text-xs" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="输入名称..." />
                              <button onClick={() => {
                                  if(!searchQuery) return;
                                  const found = standardGraphData.nodes.filter(n => n.id.includes(searchQuery));
                                  if(found.length) {
                                      setExpandedNodeIds(found.map(n=>n.id));
                                      setSelectedType('all');
                                  }
                                  else alert("未找到节点");
                              }} className="bg-emerald-500 text-white px-2 rounded hover:bg-emerald-600"><MagnifyingGlassIcon className="w-4 h-4"/></button>
                          </div>
                      </div>
                      <div className="text-xs space-y-2 mt-4 pt-4 border-t">
                          <h3 className="font-bold text-gray-500">图谱统计</h3>
                          <div className="flex justify-between"><span>节点总数:</span> <span>{standardGraphData.nodes.length}</span></div>
                          <div className="flex justify-between"><span>关系总数:</span> <span>{standardGraphData.links.length}</span></div>
                      </div>
                  </div>
              )}

              {/* IMPORT SIDEBAR (Refactored: No AI, Unified Add) */}
              {activeTab === DataTab.IMPORT && (
                  <div className="space-y-4 flex flex-col h-full">
                       <div className="bg-blue-50 p-3 rounded text-xs text-blue-800 border border-blue-100">
                          支持导入CSV格式数据。点击“读取”加载本地文件内容。
                          <br/>注：第一行将被视为表头并忽略。
                       </div>
                       
                       <div className="flex-1 space-y-4">
                           <div>
                              <div className="flex justify-between items-center mb-1">
                                  <label className="text-xs font-bold">实体 CSV (类型,名称)</label>
                                  <button onClick={() => triggerFileUpload('entity')} className="flex items-center gap-1 text-emerald-600 text-xs hover:text-emerald-800 font-bold border px-2 py-0.5 rounded bg-white">
                                      <DocumentTextIcon className="w-3 h-3" /> 读取文件
                                  </button>
                              </div>
                              <textarea className="w-full border rounded text-xs p-2 h-32 resize-none focus:ring-1 focus:ring-emerald-500 font-mono" value={entityCsv} onChange={e => setEntityCsv(e.target.value)} placeholder="类型,名称&#10;疾病,感冒&#10;..."></textarea>
                           </div>

                           <div>
                              <div className="flex justify-between items-center mb-1">
                                  <label className="text-xs font-bold">关系 CSV (源,关系,目标)</label>
                                  <button onClick={() => triggerFileUpload('relation')} className="flex items-center gap-1 text-emerald-600 text-xs hover:text-emerald-800 font-bold border px-2 py-0.5 rounded bg-white">
                                      <DocumentTextIcon className="w-3 h-3" /> 读取文件
                                  </button>
                              </div>
                              <textarea className="w-full border rounded text-xs p-2 h-32 resize-none focus:ring-1 focus:ring-emerald-500 font-mono" value={relationCsv} onChange={e => setRelationCsv(e.target.value)} placeholder="源,关系,目标&#10;感冒,包含,咳嗽&#10;..."></textarea>
                           </div>
                       </div>

                       <div className="mt-auto pt-4 space-y-2">
                           <button onClick={handleBatchImport} className="w-full bg-emerald-600 text-white font-bold py-3 rounded flex items-center justify-center gap-2 hover:bg-emerald-700 transition shadow">
                              <PlusCircleIcon className="w-5 h-5"/> 添加数据
                           </button>
                           <button onClick={clearGraph} className="w-full border border-red-200 text-red-600 text-xs py-2 rounded hover:bg-red-50 flex items-center justify-center gap-1 transition">
                              <TrashIcon className="w-4 h-4"/> 清空图谱
                           </button>
                       </div>
                  </div>
              )}

              {/* STYLE SIDEBAR */}
              {activeTab === DataTab.STYLE && (
                   <div className="space-y-4">
                      <div className="text-xs">
                          <h3 className="font-bold mb-2 flex items-center gap-1"><AdjustmentsHorizontalIcon className="w-4 h-4"/> 全局设置</h3>
                          <label className="flex items-center justify-between mb-2">
                              <span>物理模拟</span>
                              <input type="checkbox" checked={graphConfig.enablePhysics} onChange={e => setGraphConfig({...graphConfig, enablePhysics: e.target.checked})} />
                          </label>
                          <label className="flex items-center justify-between mb-2">
                              <span>布局模式</span>
                              <select className="border rounded p-1" value={graphConfig.layoutMode} onChange={e => setGraphConfig({...graphConfig, layoutMode: e.target.value as any})}>
                                  <option value="force">力导向</option>
                                  <option value="radial">辐射布局</option>
                                  <option value="cluster">聚类布局</option>
                              </select>
                          </label>
                          <label className="block mb-2">
                              <span className="mb-1 block">连线距离 ({graphConfig.linkDistance})</span>
                              <input type="range" min="30" max="300" value={graphConfig.linkDistance} onChange={e => setGraphConfig({...graphConfig, linkDistance: Number(e.target.value)})} className="w-full"/>
                          </label>
                           <label className="block mb-2">
                              <span className="mb-1 block">排斥力度 ({Math.abs(graphConfig.chargeStrength)})</span>
                              <input type="range" min="10" max="1000" value={Math.abs(graphConfig.chargeStrength)} onChange={e => setGraphConfig({...graphConfig, chargeStrength: -Number(e.target.value)})} className="w-full"/>
                          </label>
                           <div className="flex items-center justify-between mb-2">
                              <span>显示箭头</span>
                              <input type="checkbox" checked={graphConfig.isDirected} onChange={e => setGraphConfig({...graphConfig, isDirected: e.target.checked})} />
                          </div>
                           <div className="flex items-center justify-between mb-2">
                              <span>连线颜色</span>
                              <input type="color" value={graphConfig.linkColor} onChange={e => setGraphConfig({...graphConfig, linkColor: e.target.value})} />
                          </div>
                      </div>
                      <div className="border-t pt-2">
                          <h3 className="font-bold mb-2 text-xs flex items-center gap-1"><SwatchIcon className="w-4 h-4"/> 节点样式</h3>
                          {(isShowingAnalysis ? Object.keys(analysisStyles) : availableTypes.filter(t=>t!=='all')).map(type => (
                              <div key={type} className="flex items-center justify-between mb-1 text-xs gap-2">
                                  <span className="truncate w-16" title={type}>{type}</span>
                                  <div className="flex gap-1 items-center">
                                      {/* Shape Selector */}
                                      <select 
                                        className="border rounded text-[10px] w-14 h-6"
                                        value={isShowingAnalysis ? 'circle' : (groupStyles[type]?.shape || 'circle')}
                                        disabled={isShowingAnalysis}
                                        onChange={e => {
                                            const newStyles = {...groupStyles};
                                            if(!newStyles[type]) newStyles[type] = { shape: 'circle', color: '#ccc' };
                                            newStyles[type].shape = e.target.value as NodeShape;
                                            setGroupStyles(newStyles);
                                        }}
                                      >
                                          <option value="circle">圆</option>
                                          <option value="square">方</option>
                                          <option value="triangle">三角</option>
                                          <option value="diamond">菱</option>
                                          <option value="star">星</option>
                                      </select>
                                      {/* Color Picker */}
                                      <input type="color" 
                                          className="h-6 w-8 p-0 border-0"
                                          value={isShowingAnalysis ? analysisStyles[type] : (groupStyles[type]?.color || '#cccccc')} 
                                          onChange={e => {
                                              const val = e.target.value;
                                              if (isShowingAnalysis) {
                                                  setAnalysisStyles(prev => ({...prev, [type]: val}));
                                              } else {
                                                  const newStyles = {...groupStyles};
                                                  if(!newStyles[type]) newStyles[type] = { shape: 'circle', color: val };
                                                  else newStyles[type].color = val;
                                                  setGroupStyles(newStyles);
                                              }
                                          }}
                                      />
                                  </div>
                              </div>
                          ))}
                      </div>
                   </div>
              )}

              {/* ANALYSIS SIDEBAR */}
              {activeTab === DataTab.ANALYSIS && (
                 <div className="space-y-4">
                    <button onClick={handleExportPDF} className="w-full py-2 bg-emerald-100 text-emerald-800 text-xs font-bold rounded mb-4 flex items-center justify-center gap-2 hover:bg-emerald-200">
                      <DocumentArrowUpIcon className="w-4 h-4"/> 生成 PDF 报告
                    </button>
                    
                    <div className="space-y-1">
                      {[
                        {id: AlgorithmType.HIERARCHICAL, name: '层次聚类'},
                        {id: AlgorithmType.KMEANS, name: 'K-Means 聚类'},
                        {id: AlgorithmType.COMMUNITY, name: '社团分析'},
                        {id: AlgorithmType.ASSOCIATION, name: '关联分析'},
                        {id: AlgorithmType.COMPLEX_NETWORK, name: '复杂网络分析'}
                      ].map(algo => (
                        <button key={algo.id} 
                            onClick={() => toggleAlgorithm(algo.id)} 
                            className={`w-full text-left px-3 py-2 text-xs rounded transition-colors ${activeAlgorithm===algo.id ? 'bg-emerald-600 text-white font-bold shadow' : 'hover:bg-gray-100 text-gray-700'}`}>
                           {algo.name}
                        </button>
                      ))}
                    </div>

                    {/* Configurations */}
                    <div className="border-t pt-4 mt-4 space-y-4 bg-gray-50 p-2 rounded">
                       {activeAlgorithm === AlgorithmType.HIERARCHICAL && (
                          <div className="space-y-2 text-xs">
                             <div className="text-[10px] text-gray-500 mb-2">
                                构造共现网络进行聚类。
                             </div>
                             <div className="grid grid-cols-2 gap-2">
                               <div>
                                 <label className="block font-bold">容器类型</label>
                                 <select className="w-full border p-1 rounded" value={algoConfig.hierarchical.containerType} onChange={e=>setAlgoConfig(p=>({...p, hierarchical:{...p.hierarchical, containerType: e.target.value}}))}>
                                   {availableTypes.filter(t=>t!=='all').map(t=><option key={t} value={t}>{t}</option>)}
                                 </select>
                               </div>
                               <div>
                                 <label className="block font-bold">实体类型</label>
                                 <select className="w-full border p-1 rounded" value={algoConfig.hierarchical.itemType} onChange={e=>setAlgoConfig(p=>({...p, hierarchical:{...p.hierarchical, itemType: e.target.value}}))}>
                                   {availableTypes.filter(t=>t!=='all').map(t=><option key={t} value={t}>{t}</option>)}
                                 </select>
                               </div>
                             </div>

                             <label className="block font-bold">距离类型</label>
                             <select className="w-full border p-1 rounded" value={algoConfig.hierarchical.distanceType} onChange={e=>setAlgoConfig(p=>({...p, hierarchical:{...p.hierarchical, distanceType: e.target.value as any}}))}>
                               <option value="euclidean">欧氏距离</option>
                               <option value="chebyshev">切比雪夫距离</option>
                               <option value="manhattan">绝对值距离</option>
                               <option value="lance">Lance 距离</option>
                             </select>
                             <label className="block font-bold">聚类方法</label>
                             <select className="w-full border p-1 rounded" value={algoConfig.hierarchical.method} onChange={e=>setAlgoConfig(p=>({...p, hierarchical:{...p.hierarchical, method: e.target.value as any}}))}>
                               <option value="complete">最长距离法</option>
                               <option value="average">类平均法</option>
                               <option value="centroid">重心法</option>
                             </select>
                             <label className="block font-bold">显示方向</label>
                             <select className="w-full border p-1 rounded" value={algoConfig.hierarchical.orientation} onChange={e=>setAlgoConfig(p=>({...p, hierarchical:{...p.hierarchical, orientation: e.target.value as any}}))}>
                               <option value="horizontal">横向</option>
                               <option value="vertical">竖向</option>
                             </select>
                             <button onClick={handleRunAlgorithm} className="w-full bg-emerald-600 text-white py-1 rounded hover:bg-emerald-700">聚类分析</button>
                          </div>
                       )}

                       {activeAlgorithm === AlgorithmType.KMEANS && (
                          <div className="space-y-2 text-xs">
                             <div className="text-[10px] text-gray-500 mb-2">
                                将实体向量化并在欧氏空间中进行 K 均值聚类。
                             </div>
                             <label className="block font-bold">实体类型 (向量化)</label>
                             <select className="w-full border p-1 rounded" value={algoConfig.kmeans.targetType} onChange={e=>setAlgoConfig(p=>({...p, kmeans:{...p.kmeans, targetType: e.target.value}}))}>
                               {availableTypes.filter(t=>t!=='all').map(t=><option key={t} value={t}>{t}</option>)}
                             </select>
                             <label className="block font-bold">簇数量 (K)</label>
                             <input type="number" className="w-full border p-1 rounded" value={algoConfig.kmeans.k} onChange={e=>setAlgoConfig(p=>({...p, kmeans:{...p.kmeans, k: Number(e.target.value)}}))}/>
                             <button onClick={handleRunAlgorithm} className="w-full bg-emerald-600 text-white py-1 rounded hover:bg-emerald-700">开始聚类</button>
                          </div>
                       )}

                       {activeAlgorithm === AlgorithmType.COMMUNITY && (
                          <div className="space-y-2 text-xs">
                             <div className="text-[10px] text-gray-500 mb-2">
                                在二模异质网络上进行社团检测 (Leiden 算法)。
                             </div>
                             <label className="block font-bold">前项类型</label>
                             <select className="w-full border p-1 rounded" value={algoConfig.community.frontType} onChange={e=>setAlgoConfig(p=>({...p, community:{...p.community, frontType: e.target.value}}))}>
                               {availableTypes.filter(t=>t!=='all').map(t=><option key={t} value={t}>{t}</option>)}
                             </select>
                             <label className="block font-bold">后项类型</label>
                             <select className="w-full border p-1 rounded" value={algoConfig.community.backType} onChange={e=>setAlgoConfig(p=>({...p, community:{...p.community, backType: e.target.value}}))}>
                               {availableTypes.filter(t=>t!=='all').map(t=><option key={t} value={t}>{t}</option>)}
                             </select>
                             <button onClick={() => {setColorSource('community'); setSizeMetric('degree'); handleRunAlgorithm()}} className="w-full bg-emerald-600 text-white py-1 rounded hover:bg-emerald-700">社团检测</button>
                          </div>
                       )}

                       {activeAlgorithm === AlgorithmType.ASSOCIATION && (
                          <div className="space-y-2 text-xs">
                             <div className="text-[10px] text-gray-500 mb-2">
                                挖掘“前项 ⇒ 后项”的关联规则 (Apriori)。
                             </div>
                             <label className="block font-bold">前项类型 (A)</label>
                             <select className="w-full border p-1 rounded" value={algoConfig.association.frontType} onChange={e=>setAlgoConfig(p=>({...p, association:{...p.association, frontType: e.target.value}}))}>
                               {availableTypes.filter(t=>t!=='all').map(t=><option key={t} value={t}>{t}</option>)}
                             </select>
                             <label className="block font-bold">后项类型 (B)</label>
                             <select className="w-full border p-1 rounded" value={algoConfig.association.backType} onChange={e=>setAlgoConfig(p=>({...p, association:{...p.association, backType: e.target.value}}))}>
                               {availableTypes.filter(t=>t!=='all').map(t=><option key={t} value={t}>{t}</option>)}
                             </select>
                             <div className="grid grid-cols-2 gap-2">
                               <div>
                                 <label>Min Support</label>
                                 <input type="number" step="0.1" className="w-full border p-1 rounded" value={algoConfig.association.minSupport} onChange={e=>setAlgoConfig(p=>({...p, association:{...p.association, minSupport: Number(e.target.value)}}))}/>
                               </div>
                               <div>
                                 <label>Min Conf</label>
                                 <input type="number" step="0.1" className="w-full border p-1 rounded" value={algoConfig.association.minConfidence} onChange={e=>setAlgoConfig(p=>({...p, association:{...p.association, minConfidence: Number(e.target.value)}}))}/>
                               </div>
                             </div>
                             <button onClick={handleRunAlgorithm} className="w-full bg-emerald-600 text-white py-1 rounded hover:bg-emerald-700">挖掘规则</button>
                          </div>
                       )}

                       {activeAlgorithm === AlgorithmType.COMPLEX_NETWORK && (
                           <div className="space-y-2 text-xs">
                              <div className="text-[10px] text-gray-500 mb-2">
                                选择共现网络类型以计算中心性。
                             </div>
                             <div className="grid grid-cols-2 gap-2">
                               <div>
                                 <label className="block font-bold">容器类型</label>
                                 <select className="w-full border p-1 rounded" value={algoConfig.complexNetwork.containerType} onChange={e=>setAlgoConfig(p=>({...p, complexNetwork:{...p.complexNetwork, containerType: e.target.value}}))}>
                                   {availableTypes.filter(t=>t!=='all').map(t=><option key={t} value={t}>{t}</option>)}
                                 </select>
                               </div>
                               <div>
                                 <label className="block font-bold">实体类型</label>
                                 <select className="w-full border p-1 rounded" value={algoConfig.complexNetwork.itemType} onChange={e=>setAlgoConfig(p=>({...p, complexNetwork:{...p.complexNetwork, itemType: e.target.value}}))}>
                                   {availableTypes.filter(t=>t!=='all').map(t=><option key={t} value={t}>{t}</option>)}
                                 </select>
                               </div>
                             </div>

                              <label className="block font-bold">中心性指标大小调整</label>
                              <select className="w-full border p-1 rounded" value={sizeMetric} onChange={e=>setSizeMetric(e.target.value as any)}>
                                <option value="degree">点度中心性</option>
                                <option value="betweenness">中介中心性</option>
                                <option value="closeness">接近中心性</option>
                              </select>
                              <div className="pt-2">
                                 <label className="block font-bold mb-1">Backbone 过滤 (权重)</label>
                                 <input type="range" min="0" max="5" step="0.1" className="w-full" value={algoConfig.backbone.threshold} onChange={e => setAlgoConfig(p=>({...p, backbone: {...p.backbone, threshold: Number(e.target.value)}}))} />
                                 <div className="text-right text-[10px] text-gray-500">{algoConfig.backbone.threshold > 0 ? `≥ ${algoConfig.backbone.threshold}` : "无过滤"}</div>
                              </div>
                              <button onClick={() => { setActiveAlgorithm(AlgorithmType.CENTRALITY); handleRunAlgorithm(); setActiveAlgorithm(AlgorithmType.COMPLEX_NETWORK); }} className="w-full bg-emerald-600 text-white py-1 rounded hover:bg-emerald-700">计算排名</button>
                           </div>
                       )}
                       
                       {!activeAlgorithm && (
                           <div className="text-xs text-gray-400 italic text-center py-4">
                               点击上方按钮选择并配置算法
                           </div>
                       )}
                    </div>
                 </div>
              )}
           </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 bg-gray-50 overflow-auto relative p-4" id="analysis-dashboard">
           {/* Hierarchical View */}
           {activeTab === DataTab.ANALYSIS && activeAlgorithm === AlgorithmType.HIERARCHICAL && dendrogramData ? (
             <div className="w-full h-full bg-white p-4 shadow rounded flex flex-col">
                <h3 className="font-bold text-gray-700 mb-2">层次聚类树状图 ({algoConfig.hierarchical.distanceType} - {algoConfig.hierarchical.method})</h3>
                <div className="flex-1">
                  <Dendrogram data={dendrogramData} width={800} height={500} orientation={algoConfig.hierarchical.orientation}/>
                </div>
             </div>
           ) : (activeTab === DataTab.ANALYSIS && activeAlgorithm === AlgorithmType.HIERARCHICAL && !dendrogramData) ? (
             <div className="w-full h-full flex items-center justify-center text-gray-400">请点击左侧“聚类分析”按钮</div>
           ) : (
             // Standard Graph View or Other Views
             <div className="w-full h-full relative border bg-white shadow rounded overflow-hidden flex flex-col">
                {activeTab === DataTab.ANALYSIS && activeAlgorithm === AlgorithmType.ASSOCIATION && assocRules.length > 0 && (
                   <div className="h-1/3 border-b overflow-auto p-4 bg-gray-50">
                      <h4 className="font-bold text-sm mb-2">关联规则列表 (Top {assocRules.length})</h4>
                      <table className="w-full text-xs text-left bg-white border">
                        <thead className="bg-gray-100">
                          <tr><th>NO</th><th>规则</th><th>支持度</th><th>置信度</th><th>提升度</th><th>共现</th></tr>
                        </thead>
                        <tbody>
                          {assocRules.map((r, i) => (
                             <tr key={i} className="border-b">
                               <td className="p-1">{i+1}</td>
                               <td className="p-1 font-mono">{r.source} ⇒ {r.target}</td>
                               <td className="p-1">{r.support.toFixed(3)}</td>
                               <td className="p-1">{r.confidence.toFixed(2)}</td>
                               <td className="p-1">{r.lift.toFixed(2)}</td>
                               <td className="p-1">{r.cooccur}</td>
                             </tr>
                          ))}
                        </tbody>
                      </table>
                      <div className="mt-2 text-[10px] text-gray-500">
                        * 支持度(Support): 规则在所有交易中出现的概率。<br/>
                        * 置信度(Confidence): 前项出现时后项同时出现的概率。<br/>
                        * 提升度(Lift): 规则的相关性，大于1 表示正相关。
                      </div>
                   </div>
                )}

                {activeTab === DataTab.ANALYSIS && activeAlgorithm === AlgorithmType.COMPLEX_NETWORK && centralityRankings && (
                    <div className="absolute top-4 right-4 z-10 w-64 bg-white/90 shadow p-2 rounded text-xs">
                        <h4 className="font-bold border-b pb-1 mb-1">中心性 Top 5</h4>
                        <div className="grid grid-cols-3 gap-2 text-[10px]">
                           <div>
                              <div className="font-bold text-emerald-600">度</div>
                              {centralityRankings.degree.map((n,i) => <div key={i}>{i+1}. {n.id} ({n.val})</div>)}
                           </div>
                           <div>
                              <div className="font-bold text-orange-600">中介</div>
                              {centralityRankings.betweenness.map((n,i) => <div key={i}>{i+1}. {n.id} ({n.val.toFixed(2)})</div>)}
                           </div>
                           <div>
                              <div className="font-bold text-blue-600">接近</div>
                              {centralityRankings.closeness.map((n,i) => <div key={i}>{i+1}. {n.id} ({n.val.toFixed(2)})</div>)}
                           </div>
                        </div>
                    </div>
                )}

                <div className="flex-1 relative">
                    <ForceGraph 
                      key={graphKey}
                      data={activeGraphData}
                      width={dimensions.width}
                      height={dimensions.height}
                      config={graphConfig}
                      groupStyles={groupStyles}
                      onNodeClick={setSelectedNode}
                      onNodeDoubleClick={handleNodeDoubleClick}
                      onNodeContextMenu={handleNodeContextMenu}
                    />
                </div>
             </div>
           )}
        </div>
      </div>

      {contextMenu.visible && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setContextMenu(prev => ({ ...prev, visible: false }))}></div>
          <div className="fixed z-50 bg-white shadow-lg rounded-lg border border-gray-200 py-1 w-32 flex flex-col text-xs text-gray-700" style={{ top: contextMenu.y, left: contextMenu.x }}>
             <button className="px-3 py-2 hover:bg-gray-100 text-left" onClick={() => { 
                 if(contextMenu.nodeId) {
                     setHiddenNodeIds(prev => { const n = new Set(prev); n.add(contextMenu.nodeId!); return n; });
                     setContextMenu(prev => ({ ...prev, visible: false }));
                 }
             }}>隐藏节点</button>
             <button className="px-3 py-2 hover:bg-gray-100 text-left" onClick={() => {
                 setContextMenu(prev => ({ ...prev, visible: false }));
                 alert("查看备注功能（开发中）");
             }}>查看备注</button>
          </div>
        </>
      )}
    </div>
  );
}

export default App;
