import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { GraphData, GraphNode, GraphLink, GraphConfig, GroupStyleMap, NodeShape } from '../types';
import { CameraIcon } from '@heroicons/react/24/outline';

interface ForceGraphProps {
  data: GraphData;
  width: number;
  height: number;
  config: GraphConfig;
  groupStyles: GroupStyleMap;
  selectedNodeId?: string | null;
  onNodeClick: (node: GraphNode) => void;
  onNodeDoubleClick: (node: GraphNode) => void;
  onNodeContextMenu?: (event: MouseEvent, node: GraphNode) => void;
}

const ForceGraph: React.FC<ForceGraphProps> = ({ 
  data, 
  width, 
  height, 
  config, 
  groupStyles, 
  onNodeClick,
  onNodeDoubleClick,
  onNodeContextMenu
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const simulationRef = useRef<d3.Simulation<GraphNode, GraphLink> | null>(null);

  const { 
    chargeStrength, 
    linkDistance, 
    collideStrength, 
    layoutMode, 
    isDirected, 
    linkColor, 
    enablePhysics 
  } = config;

  const getSymbol = (shape: NodeShape) => {
    switch (shape) {
      case 'square': return d3.symbolSquare;
      case 'diamond': return d3.symbolDiamond;
      case 'triangle': return d3.symbolTriangle;
      case 'star': return d3.symbolStar;
      case 'circle':
      default: return d3.symbolCircle;
    }
  };

  const saveAsImage = () => {
    if (!svgRef.current) return;
    const svg = svgRef.current;
    
    // Get SVG source
    const serializer = new XMLSerializer();
    let source = serializer.serializeToString(svg);

    // Add name spaces
    if(!source.match(/^<svg[^>]+xmlns="http\:\/\/www\.w3\.org\/2000\/svg"/)){
        source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
    }
    if(!source.match(/^<svg[^>]+xmlns:xlink="http\:\/\/www\.w3\.org\/1999\/xlink"/)){
        source = source.replace(/^<svg/, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
    }

    // Add XML declaration
    source = '<?xml version="1.0" standalone="no"?>\r\n' + source;

    // Convert to blob and draw to canvas to export as PNG
    const imgsrc = 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(source);
    
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return;
    
    // Fill white background
    context.fillStyle = "#ffffff";
    context.fillRect(0,0,width,height);

    const image = new Image();
    image.onload = function() {
        context.drawImage(image, 0, 0);
        const a = document.createElement("a");
        a.download = "knowledge-graph.png";
        a.href = canvas.toDataURL("image/png");
        a.click();
    };
    image.src = imgsrc;
  };

  useEffect(() => {
    if (!svgRef.current || width === 0 || height === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove(); 

    if (!data.nodes || data.nodes.length === 0) {
      if (simulationRef.current) {
        simulationRef.current.stop();
        simulationRef.current = null;
      }
      return;
    }

    const container = svg.append("g");

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 8])
      .on("zoom", (event) => {
        container.attr("transform", event.transform);
      });

    svg.call(zoom);
    svg.call(zoom.transform, d3.zoomIdentity.translate(width/2, height/2).scale(1).translate(-width/2, -height/2)); // Center initial view more robustly

    // Filter out invalid links
    const nodeIds = new Set(data.nodes.map(n => n.id));
    const validLinks = data.links.filter(l => {
      const s = typeof l.source === 'object' ? (l.source as GraphNode).id : l.source as string;
      const t = typeof l.target === 'object' ? (l.target as GraphNode).id : l.target as string;
      return nodeIds.has(s) && nodeIds.has(t);
    });

    const simulation = d3.forceSimulation<GraphNode, GraphLink>(data.nodes)
      .force("link", d3.forceLink<GraphNode, GraphLink>(validLinks).id(d => d.id).distance(linkDistance))
      .force("charge", d3.forceManyBody().strength(chargeStrength))
      .force("collide", d3.forceCollide(collideStrength))
      .force("center", d3.forceCenter(width / 2, height / 2));

    // Layout Mode Overrides
    if (layoutMode === 'cluster') {
       simulation.force("charge", d3.forceManyBody().strength(chargeStrength * 0.5)); // Weaker charge for cluster
       // Custom cluster force could be added here, but simpler to just let force layout resolve with center gravity
    } else if (layoutMode === 'radial') {
       simulation.force("charge", d3.forceManyBody().strength(-50));
       simulation.force("r", d3.forceRadial(Math.min(width, height) / 3, width / 2, height / 2).strength(0.8));
    }

    simulationRef.current = simulation;

    const defs = svg.append("defs");
    defs.selectAll("marker")
      .data(["end"])
      .enter().append("marker")
      .attr("id", "arrow")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 25) 
      .attr("refY", 0)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", linkColor);

    const link = container.append("g")
      .selectAll<SVGLineElement, GraphLink>("line")
      .data(validLinks)
      .join("line")
      .attr("stroke", linkColor)
      .attr("stroke-opacity", (d) => {
        if (d.weight && d.weight > 1) return 0.8;
        return 0.6;
      })
      .attr("stroke-width", (d) => {
        return Math.min(1 + (d.weight ? (d.weight - 1) * 0.5 : 0), 4);
      });
    
    if (isDirected) {
      link.attr("marker-end", "url(#arrow)");
    }

    const linkLabel = container.append("g")
      .selectAll<SVGTextElement, GraphLink>("text")
      .data(validLinks)
      .join("text")
      .text((d) => d.type === 'co-occur' ? (d.weight && d.weight > 1 ? d.weight : '') : d.type)
      .attr("font-size", "8px")
      .attr("fill", linkColor)
      .attr("text-anchor", "middle")
      .attr("dy", -4);

    const node = container.append("g")
      .selectAll<SVGGElement, GraphNode>("g")
      .data(data.nodes)
      .join("g")
      .call(d3.drag<SVGGElement, GraphNode>()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended));

    node.append("path")
      .attr("d", (d) => {
        // Use groupStyles but fallback to internal _radius if analyzing
        const style = groupStyles[d.group] || { shape: 'circle', color: '#ccc' };
        const size = d._radius ? (Math.PI * (d._radius * d._radius)) : 400;
        const symbolGen = d3.symbol().type(getSymbol(style.shape)).size(size); 
        return symbolGen() || "";
      })
      .attr("fill", (d) => {
        // Priority: Analysis Color > Group Color
        if (d._color) return d._color;
        const style = groupStyles[d.group];
        return style ? style.color : '#ccc';
      })
      .attr("stroke", "#fff")
      .attr("stroke-width", 2)
      .style("cursor", "pointer")
      .on("click", (event, d) => {
        event.stopPropagation();
        onNodeClick(d);
      })
      .on("dblclick", (event, d) => {
        event.stopPropagation();
        onNodeDoubleClick(d);
      })
      .on("contextmenu", (event, d) => {
        event.preventDefault();
        event.stopPropagation();
        if (onNodeContextMenu) onNodeContextMenu(event, d);
      });

    node.append("text")
      .text((d) => d.id)
      .attr("x", (d) => (d._radius || 12) + 4)
      .attr("y", 4)
      .attr("font-size", (d) => d._radius ? `${Math.max(10, d._radius * 0.8)}px` : "12px")
      .attr("font-weight", "bold")
      .attr("fill", "#374151")
      .style("pointer-events", "none")
      .clone(true).lower()
      .attr("stroke", "white")
      .attr("stroke-width", 3);

    function ticked() {
      link
        .attr("x1", (d) => (d.source as GraphNode).x!)
        .attr("y1", (d) => (d.source as GraphNode).y!)
        .attr("x2", (d) => (d.target as GraphNode).x!)
        .attr("y2", (d) => (d.target as GraphNode).y!);

      linkLabel
        .attr("x", (d) => ((d.source as GraphNode).x! + (d.target as GraphNode).x!) / 2)
        .attr("y", (d) => ((d.source as GraphNode).y! + (d.target as GraphNode).y!) / 2);

      node.attr("transform", (d) => `translate(${d.x || 0},${d.y || 0})`);
    }

    simulation.on("tick", ticked);
    
    if (!enablePhysics) {
      // Run a few ticks then stop if physics disabled
      simulation.tick(100);
      ticked(); 
      simulation.stop();
    } else {
      simulation.alpha(1).restart();
    }

    function dragstarted(event: d3.D3DragEvent<SVGGElement, GraphNode, unknown>, d: GraphNode) {
      if (simulationRef.current && config.enablePhysics) {
         simulationRef.current.alphaTarget(0.3).restart();
      }
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event: d3.D3DragEvent<SVGGElement, GraphNode, unknown>, d: GraphNode) {
      d.fx = event.x;
      d.fy = event.y;
      if (!config.enablePhysics) {
        d.x = event.x;
        d.y = event.y;
        ticked(); 
      }
    }

    function dragended(event: d3.D3DragEvent<SVGGElement, GraphNode, unknown>, d: GraphNode) {
      if (simulationRef.current && config.enablePhysics) {
        simulationRef.current.alphaTarget(0);
      }
      if (config.enablePhysics) {
         d.fx = null;
         d.fy = null;
      }
    }
    
    return () => {
      simulation.stop();
    };
  }, [data, width, height, layoutMode, isDirected, linkColor, groupStyles, config.collideStrength, config.chargeStrength, config.linkDistance]); 

  useEffect(() => {
    const simulation = simulationRef.current;
    if (!simulation) return;
    if (enablePhysics) {
      simulation.alphaTarget(0.3).restart();
    } else {
      simulation.stop();
    }
  }, [enablePhysics]);

  if (width === 0 || height === 0) {
    return <div ref={wrapperRef} className="w-full h-full bg-slate-50 flex items-center justify-center text-gray-400 text-xs">Loading graph...</div>;
  }

  return (
    <div ref={wrapperRef} className="w-full h-full bg-slate-50 overflow-hidden relative shadow-inner select-none">
      <svg ref={svgRef} width={width} height={height} className="block cursor-grab active:cursor-grabbing" />
      <div className="absolute top-4 right-4 flex gap-2">
        <button 
           onClick={saveAsImage}
           className="bg-white/90 p-2 rounded-full shadow hover:bg-emerald-50 text-emerald-600 transition"
           title="导出为图片"
        >
          <CameraIcon className="w-5 h-5" />
        </button>
      </div>
      <div className="absolute bottom-4 right-4 bg-white/90 p-2 rounded shadow text-xs text-gray-500 flex flex-col gap-1 pointer-events-none border border-gray-100 backdrop-blur-sm">
        <span>左键: 选择/拖拽 | 双击: 聚焦</span>
        <span>右键: 更多选项 | 滚轮: 缩放</span>
      </div>
    </div>
  );
};

export default ForceGraph;