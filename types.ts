import { SimulationNodeDatum, SimulationLinkDatum } from 'd3';

// Extends D3's node datum to include our custom properties
export interface GraphNode extends SimulationNodeDatum {
  id: string; // The unique identifier (usually the name)
  group: string; // The "Type" (e.g., Disease, Symptom)
  
  // Visual overrides for Analysis Mode
  _radius?: number; 
  _color?: string;
  
  // Analysis Metrics storage
  metrics?: {
    degree: number;
    betweenness: number;
    closeness: number;
    kCore: number;
    community: number;
    clusteringCoeff: number; // Local Clustering Coefficient
    pagerank?: number;
    [key: string]: number | undefined;
  };
  
  // Clustering results
  clusters?: {
    kmeans?: number;
    hierarchical?: number;
  };

  // Explicitly define D3 properties to ensure TypeScript recognizes them
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
}

// Extends D3's link datum
export interface GraphLink extends SimulationLinkDatum<GraphNode> {
  type: string; // The relationship name or weight
  weight?: number; // For co-occurrence
  
  // Association Rules Metrics
  association?: {
    support: number;
    confidence: number;
    lift: number;
    isRule?: boolean; // If true, this link represents a mined rule
  };

  // Explicitly define D3 properties
  source: string | number | GraphNode;
  target: string | number | GraphNode;
}

export interface RawEntity {
  type: string;
  name: string;
}

export interface RawRelation {
  source: string;
  relation: string;
  target: string;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
  metadata?: {
    density?: number;
    avgDegree?: number;
    diameter?: number;
    avgPathLength?: number;
    globalClusteringCoeff?: number;
    transactionCount?: number; // For association analysis
  };
  dendrogram?: DendrogramNode; // For Hierarchical Tree
}

// For Hierarchical Tree
export interface DendrogramNode {
  name: string;
  children?: DendrogramNode[];
  distance?: number; // Height in dendrogram
  isLeaf?: boolean;
}

export interface AssociationRuleResult {
  source: string;
  target: string;
  support: number;
  confidence: number;
  lift: number;
  cooccur: number;
}

export enum DataTab {
  MANUAL = 'MANUAL',
  IMPORT = 'IMPORT',
  STYLE = 'STYLE',
  ANALYSIS = 'ANALYSIS'
}

export type LayoutMode = 'force' | 'cluster' | 'radial';

export interface GraphConfig {
  chargeStrength: number;
  linkDistance: number;
  collideStrength: number;
  layoutMode: LayoutMode;
  isDirected: boolean;
  linkColor: string;
  enablePhysics: boolean;
}

export type NodeShape = 'circle' | 'square' | 'diamond' | 'triangle' | 'star';

export interface GroupStyle {
  color: string;
  shape: NodeShape;
}

export type GroupStyleMap = Record<string, GroupStyle>;

// Analysis Configuration
export enum AnalysisMode {
  NONE = 'NONE',
  PRESCRIPTION_HERB = 'PRESCRIPTION_HERB', 
  SYNDROME_SYMPTOM = 'SYNDROME_SYMPTOM',   
  SYNDROME_HERB = 'SYNDROME_HERB'          
}

export type AnalysisMetricType = 'degree' | 'betweenness' | 'closeness' | 'kCore' | 'community' | 'none';

export enum AlgorithmType {
  HIERARCHICAL = 'HIERARCHICAL',
  KMEANS = 'KMEANS',
  COMMUNITY = 'COMMUNITY',
  ASSOCIATION = 'ASSOCIATION',
  COMPLEX_NETWORK = 'COMPLEX_NETWORK', // Centrality & Co-occurrence
  CENTRALITY = 'CENTRALITY'
}

export type DistanceType = 'euclidean' | 'chebyshev' | 'manhattan' | 'lance';
export type ClusterMethod = 'complete' | 'average' | 'centroid';

export interface AnalysisAlgoConfig {
  hierarchical: {
    k: number;
    distanceType: DistanceType;
    method: ClusterMethod;
    orientation: 'vertical' | 'horizontal';
    containerType: string;
    itemType: string;
  };
  kmeans: {
    k: number;
    targetType: string; // The entity type to cluster
  };
  community: {
    frontType: string;
    backType: string;
    resolution: number;
  };
  association: {
    frontType: string;
    backType: string;
    minSupport: number;
    minConfidence: number;
  };
  backbone: {
    threshold: number;
    metric: 'weight' | 'lift';
  };
  complexNetwork: {
    containerType: string;
    itemType: string;
  };
}