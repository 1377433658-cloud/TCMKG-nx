import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { DendrogramNode } from '../types';

interface DendrogramProps {
  data: DendrogramNode;
  orientation: 'vertical' | 'horizontal';
  width: number;
  height: number;
}

const Dendrogram: React.FC<DendrogramProps> = ({ data, orientation, width, height }) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || !data) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const margin = { top: 40, right: 40, bottom: 40, left: 40 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const root = d3.hierarchy(data);

    // D3 Cluster Layout
    const cluster = d3.cluster<DendrogramNode>();
    
    if (orientation === 'vertical') {
       cluster.size([innerWidth, innerHeight]);
    } else {
       cluster.size([innerHeight, innerWidth]);
    }
    
    cluster(root);

    const g = svg.append("g")
       .attr("transform", `translate(${margin.left},${margin.top})`);

    // Links
    g.selectAll(".link")
      .data(root.links())
      .enter().append("path")
      .attr("class", "link")
      .attr("fill", "none")
      .attr("stroke", "#ccc")
      .attr("stroke-width", 1.5)
      .attr("d", d => {
        if (orientation === 'vertical') {
            // Elbow connector for vertical
            return `M${d.source.x},${d.source.y} V${d.target.y} H${d.target.x}`;
        } else {
            // Elbow connector for horizontal
            return `M${d.source.y},${d.source.x} H${d.target.y} V${d.target.x}`;
        }
      });

    // Nodes
    const node = g.selectAll(".node")
      .data(root.descendants())
      .enter().append("g")
      .attr("class", "node")
      .attr("transform", d => orientation === 'vertical' ? `translate(${d.x},${d.y})` : `translate(${d.y},${d.x})`);

    node.append("circle")
      .attr("r", 3)
      .attr("fill", d => d.data.isLeaf ? "#eab308" : "#999");

    // Labels (only for leaves or if needed)
    node.filter(d => !!d.data.isLeaf)
      .append("text")
      .attr("dy", orientation === 'vertical' ? 15 : 4)
      .attr("dx", orientation === 'vertical' ? 0 : 8)
      .attr("text-anchor", orientation === 'vertical' ? "middle" : "start")
      .text(d => d.data.name)
      .attr("font-size", "10px")
      .attr("transform", orientation === 'vertical' ? "rotate(90)" : "")
      .style("writing-mode", orientation === 'vertical' ? "vertical-rl" : "horizontal-tb");

  }, [data, orientation, width, height]);

  return (
    <div className="w-full h-full bg-white border border-gray-100 rounded overflow-auto">
      <svg ref={svgRef} width={width} height={height} />
    </div>
  );
};

export default Dendrogram;