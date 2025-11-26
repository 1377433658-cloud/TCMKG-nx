import { GraphNode, GraphLink, RawEntity, RawRelation, GraphData, DendrogramNode, DistanceType, ClusterMethod, AssociationRuleResult } from '../types';

// Helper: Get Adjacency List
const getAdjacency = (nodes: GraphNode[], links: GraphLink[], weighted: boolean = false) => {
  const adj = new Map<string, Array<{id: string, weight: number}>>();
  nodes.forEach(n => adj.set(n.id, []));
  
  links.forEach(l => {
    const s = typeof l.source === 'object' ? (l.source as GraphNode).id : l.source as string;
    const t = typeof l.target === 'object' ? (l.target as GraphNode).id : l.target as string;
    const w = weighted ? (l.weight || 1) : 1;
    
    if (adj.has(s)) adj.get(s)?.push({id: t, weight: w});
    if (adj.has(t)) adj.get(t)?.push({id: s, weight: w}); // Undirected for analysis usually
  });
  return adj;
};

// Distance Functions
const calculateDistance = (vecA: number[], vecB: number[], type: DistanceType): number => {
  if (type === 'manhattan') { // Absolute value
    return vecA.reduce((sum, v, i) => sum + Math.abs(v - vecB[i]), 0);
  } else if (type === 'chebyshev') {
    return vecA.reduce((max, v, i) => Math.max(max, Math.abs(v - vecB[i])), 0);
  } else if (type === 'lance') {
    // Implementing Canberra distance as "Lance" style robust distance
    return vecA.reduce((sum, v, i) => {
       const denom = Math.abs(v) + Math.abs(vecB[i]);
       return sum + (denom === 0 ? 0 : Math.abs(v - vecB[i]) / denom);
    }, 0);
  }
  // Default Euclidean
  return Math.sqrt(vecA.reduce((sum, v, i) => sum + Math.pow(v - vecB[i], 2), 0));
};

// --- ALGORITHMS ---

// 1. Hierarchical Clustering (Output: Dendrogram Tree)
const calculateHierarchicalTree = (
  nodes: GraphNode[], 
  links: GraphLink[], 
  config: { distanceType: DistanceType, method: ClusterMethod }
): DendrogramNode => {
  // 1. Create Vectors based on adjacency (1-mode co-occurrence)
  const adj = getAdjacency(nodes, links, true);
  const vectors: Record<string, number[]> = {};
  const allNodeIds = nodes.map(n => n.id);
  
  nodes.forEach(n => {
    // Vector is the weight to all other nodes
    vectors[n.id] = allNodeIds.map(id => {
      if (id === n.id) return 0;
      const neighbor = adj.get(n.id)?.find(x => x.id === id);
      return neighbor ? neighbor.weight : 0;
    });
  });

  // 2. Initialize Clusters
  // Each cluster is { id: string, members: string[], tree: DendrogramNode, vec: number[] }
  let clusters = nodes.map((n, idx) => ({
    id: `c_${idx}`,
    members: [n.id],
    vec: vectors[n.id],
    tree: { name: n.id, isLeaf: true, distance: 0 } as DendrogramNode
  }));

  // Helper to calc dist between two clusters based on Linkage Method
  const getClusterDist = (c1: typeof clusters[0], c2: typeof clusters[0]): number => {
    if (config.method === 'centroid') {
       // Distance between geometric centers
       return calculateDistance(c1.vec, c2.vec, config.distanceType);
    } else {
       // Pairwise distances
       let dists: number[] = [];
       c1.members.forEach(m1 => {
         c2.members.forEach(m2 => {
           dists.push(calculateDistance(vectors[m1], vectors[m2], config.distanceType));
         });
       });
       if (config.method === 'complete') return Math.max(...dists); // Longest distance
       // Average
       return dists.reduce((a,b) => a+b, 0) / dists.length;
    }
  };

  // 3. Loop until 1 cluster remains
  while (clusters.length > 1) {
    let minD = Infinity;
    let mergeIdx1 = -1;
    let mergeIdx2 = -1;

    // Find closest pair
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const d = getClusterDist(clusters[i], clusters[j]);
        if (d < minD) {
          minD = d;
          mergeIdx1 = i;
          mergeIdx2 = j;
        }
      }
    }

    if (mergeIdx1 === -1) break; // Should not happen

    const c1 = clusters[mergeIdx1];
    const c2 = clusters[mergeIdx2];

    // Merge
    const newMembers = [...c1.members, ...c2.members];
    
    // Calculate new vector (Centroid)
    const newVec = newMembers[0] ? vectors[newMembers[0]].map((_, i) => {
        return newMembers.reduce((sum, m) => sum + vectors[m][i], 0) / newMembers.length;
    }) : [];

    const newCluster = {
      id: `merged_${Date.now()}_${Math.random()}`,
      members: newMembers,
      vec: newVec,
      tree: {
        name: "",
        distance: minD,
        children: [c1.tree, c2.tree]
      } as DendrogramNode
    };

    // Remove old, add new
    clusters = clusters.filter((_, idx) => idx !== mergeIdx1 && idx !== mergeIdx2);
    clusters.push(newCluster);
  }

  return clusters[0]?.tree || { name: "Root", children: [] };
};

// 2. K-Means (Heterogeneous Vectorization)
// e.g., Cluster "Herbs" based on which "Formulas" they appear in.
export const calculateVectorKMeans = (
  entities: RawEntity[],
  relations: RawRelation[],
  targetType: string,
  k: number
): { result: Record<string, number>, nodes: GraphNode[] } => {
  // 1. Identify target nodes
  const targetNodes = entities.filter(e => e.type === targetType);
  if (targetNodes.length === 0) return { result: {}, nodes: [] };

  // 2. Identify context nodes (neighbors)
  // Find all relations involving target nodes
  const relevantRelations = relations.filter(r => 
    entities.some(e => e.name === r.source && e.type === targetType) || 
    entities.some(e => e.name === r.target && e.type === targetType)
  );

  const contextFeatures = new Set<string>();
  const nodeConnections = new Map<string, Set<string>>();

  relevantRelations.forEach(r => {
    let target = "", feature = "";
    if (entities.find(e => e.name === r.source)?.type === targetType) {
      target = r.source; feature = r.target;
    } else {
      target = r.target; feature = r.source;
    }
    contextFeatures.add(feature);
    if (!nodeConnections.has(target)) nodeConnections.set(target, new Set());
    nodeConnections.get(target)?.add(feature);
  });

  const featureList = Array.from(contextFeatures).sort();
  
  // 3. Vectorize
  const vectors = targetNodes.map(n => {
    const conns = nodeConnections.get(n.name) || new Set();
    return featureList.map(f => conns.has(f) ? 1 : 0);
  });

  // 4. K-Means
  let centroids = vectors.slice(0, k);
  if (vectors.length < k) centroids = vectors;
  
  let assignments = new Array(vectors.length).fill(0);

  const distance = (a: number[], b: number[]) => {
    return Math.sqrt(a.reduce((sum, val, i) => sum + Math.pow(val - b[i], 2), 0));
  };

  for (let iter = 0; iter < 10; iter++) {
    vectors.forEach((v, i) => {
      let minDist = Infinity;
      let cIdx = 0;
      centroids.forEach((c, ci) => {
        const d = distance(v, c);
        if (d < minDist) { minDist = d; cIdx = ci; }
      });
      assignments[i] = cIdx;
    });

    // Update Centroids
    const newCentroids = Array(k).fill(0).map(() => new Array(featureList.length).fill(0));
    const counts = Array(k).fill(0);
    
    vectors.forEach((v, i) => {
      const c = assignments[i];
      counts[c]++;
      v.forEach((val, dim) => newCentroids[c][dim] += val);
    });

    centroids = newCentroids.map((c, i) => counts[i] > 0 ? c.map(x => x / counts[i]) : c);
  }

  const result: Record<string, number> = {};
  targetNodes.forEach((n, i) => result[n.name] = assignments[i]);
  
  // Return fake GraphNodes for visualization
  const resultNodes: GraphNode[] = targetNodes.map(n => ({
    id: n.name,
    group: n.type,
    clusters: { kmeans: result[n.name] }
  }));

  return { result, nodes: resultNodes };
};

// 3. Bipartite Community Detection (Simulated Leiden)
// Uses simple label propagation on a filtered bipartite graph
export const calculateBipartiteCommunity = (
  entities: RawEntity[],
  relations: RawRelation[],
  frontType: string,
  backType: string
): { nodes: GraphNode[], links: GraphLink[] } => {
  // Extract Bipartite Subgraph
  const frontNodes = entities.filter(e => e.type === frontType);
  const backNodes = entities.filter(e => e.type === backType);
  const validNames = new Set([...frontNodes, ...backNodes].map(e => e.name));

  const validLinks = relations.filter(r => validNames.has(r.source) && validNames.has(r.target) && r.source !== r.target);
  
  // Construct Graph
  const nodes: GraphNode[] = [...frontNodes, ...backNodes].map(e => ({
    id: e.name, group: e.type, metrics: { degree: 0, betweenness: 0, closeness: 0, kCore: 0, community: 0, clusteringCoeff: 0}
  }));
  const links: GraphLink[] = validLinks.map(r => ({ source: r.source, target: r.target, type: r.relation }));

  // Run Label Propagation (Simple proxy for Leiden/Louvain in JS)
  const adj = getAdjacency(nodes, links);
  let labels: Record<string, number> = {};
  nodes.forEach((n, i) => labels[n.id] = i);

  for (let i = 0; i < 20; i++) { // Iterations
    const shuffled = [...nodes].sort(() => Math.random() - 0.5);
    let change = false;
    for (const n of shuffled) {
       const neighbors = adj.get(n.id) || [];
       if (!neighbors.length) continue;
       const counts: Record<number, number> = {};
       neighbors.forEach(nb => {
          const l = labels[nb.id];
          counts[l] = (counts[l] || 0) + 1;
       });
       let bestL = -1, maxC = -1;
       Object.entries(counts).forEach(([l, c]) => {
          if (c > maxC) { maxC = c; bestL = Number(l); }
       });
       if (bestL !== -1 && labels[n.id] !== bestL) {
         labels[n.id] = bestL;
         change = true;
       }
    }
    if (!change) break;
  }

  // Remap labels to 0..N
  const uniqueLabels = Array.from(new Set(Object.values(labels)));
  const labelMap = new Map(uniqueLabels.map((l, i) => [l, i]));
  
  nodes.forEach(n => {
    if (n.metrics) n.metrics.community = labelMap.get(labels[n.id]) || 0;
  });

  return { nodes, links };
};

// 4. Association Rules (Apriori-like)
export const calculateAssociationRules = (
  entities: RawEntity[],
  relations: RawRelation[],
  frontType: string,
  backType: string,
  minSupport: number,
  minConfidence: number
): { rules: AssociationRuleResult[], nodes: GraphNode[], links: GraphLink[] } => {
  // We need to define "Transactions". 
  // Assumption: A transaction is an entity that connects both FrontItem and BackItem.
  // E.g. Syndrome X has Symptom A (Front) and uses Formula B (Back).
  // Transaction ID = Syndrome X.
  // If direct link: Source(Front) -> Target(Back), then Transaction is the edge itself (count=1).
  
  // Strategy: Find all "Common Parents" or "Connectors". 
  // Let's assume the "Medical Case" is implicit. 
  // We look for patterns:  FrontItem -> [Connector] <- BackItem  OR FrontItem -> BackItem
  
  const transactions: Map<string, Set<string>> = new Map();

  // 1. Direct Links (Front -> Back)
  relations.forEach((r, idx) => {
    const sType = entities.find(e => e.name === r.source)?.type;
    const tType = entities.find(e => e.name === r.target)?.type;
    
    if (sType === frontType && tType === backType) {
      transactions.set(`direct_${idx}`, new Set([r.source, r.target]));
    }
  });

  // 2. Connector-based (e.g. Syndrome connects Symptom and Herb)
  const connectorMap: Map<string, Set<string>> = new Map();
  relations.forEach(r => {
     // If target is potential connector (not front/back)
     // Or source is connector.
     // Let's simplified: Group everything by the "Source" (Assuming source is Disease/Syndrome/Formula)
     // And "Target" are the components (Symptoms, Herbs).
     
     // Case A: Disease -> Symptom AND Disease -> Herb.
     const s = r.source;
     if (!connectorMap.has(s)) connectorMap.set(s, new Set());
     connectorMap.get(s)?.add(r.target);
  });

  connectorMap.forEach((items, connector) => {
    // Filter items to only include FrontType and BackType
    const fronts = Array.from(items).filter(i => entities.find(e => e.name === i)?.type === frontType);
    const backs = Array.from(items).filter(i => entities.find(e => e.name === i)?.type === backType);
    
    if (fronts.length > 0 && backs.length > 0) {
      // Create a transaction for this connector
      const t = new Set([...fronts, ...backs]);
      transactions.set(connector, t);
    }
  });

  const totalTrans = transactions.size;
  if (totalTrans === 0) return { rules: [], nodes: [], links: [] };

  const itemCounts = new Map<string, number>();
  const pairCounts = new Map<string, number>();

  transactions.forEach(items => {
    const arr = Array.from(items);
    arr.forEach(i => itemCounts.set(i, (itemCounts.get(i) || 0) + 1));
    
    // Check pairs (Front -> Back)
    arr.filter(i => entities.find(e => e.name === i)?.type === frontType).forEach(f => {
      arr.filter(i => entities.find(e => e.name === i)?.type === backType).forEach(b => {
        const key = `${f}|${b}`;
        pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
      });
    });
  });

  const rules: AssociationRuleResult[] = [];
  const validNodes = new Set<string>();

  pairCounts.forEach((count, key) => {
    const [source, target] = key.split('|');
    const support = count / totalTrans;
    const supportSource = (itemCounts.get(source) || 0) / totalTrans;
    const supportTarget = (itemCounts.get(target) || 0) / totalTrans;
    
    if (support >= minSupport) {
      const confidence = support / supportSource;
      if (confidence >= minConfidence) {
        const lift = confidence / supportTarget;
        rules.push({ source, target, support, confidence, lift, cooccur: count });
        validNodes.add(source);
        validNodes.add(target);
      }
    }
  });

  rules.sort((a, b) => b.lift - a.lift);

  // Convert to Graph
  const graphNodes = Array.from(validNodes).map(id => ({
    id, group: entities.find(e => e.name === id)?.type || "Unknown",
    metrics: { degree: 0, betweenness: 0, closeness: 0, kCore: 0, community: 0, clusteringCoeff: 0 }
  }));
  
  const graphLinks: GraphLink[] = rules.map(r => ({
    source: r.source,
    target: r.target,
    type: "assoc",
    association: { support: r.support, confidence: r.confidence, lift: r.lift, isRule: true }
  }));

  return { rules, nodes: graphNodes, links: graphLinks };
};

// 5. Centrality Rankings
export const calculateCentralityRankings = (nodes: GraphNode[], links: GraphLink[]) => {
   const adj = getAdjacency(nodes, links);
   
   // Degree
   const degrees = nodes.map(n => ({ id: n.id, val: adj.get(n.id)?.length || 0 })).sort((a, b) => b.val - a.val);
   
   // Betweenness (Simplified Brandes from previous code)
   // We reuse the existing CalculateBetweenness function logic
   const CB = calculateBetweenness(nodes, adj);
   const betweens = nodes.map(n => ({ id: n.id, val: CB[n.id] })).sort((a, b) => b.val - a.val);

   // Closeness
   const CC = calculateCloseness(nodes, adj);
   const closes = nodes.map(n => ({ id: n.id, val: CC[n.id] })).sort((a, b) => b.val - a.val);

   return {
     degree: degrees.slice(0, 5),
     betweenness: betweens.slice(0, 5),
     closeness: closes.slice(0, 5)
   };
};


// --- Internal Utils reused ---
const calculateBetweenness = (nodes: GraphNode[], adj: Map<string, Array<{id: string, weight: number}>>) => {
  const CB: Record<string, number> = {};
  nodes.forEach(n => CB[n.id] = 0);
  nodes.forEach(s => {
    const S: string[] = [];
    const P: Record<string, string[]> = {};
    const sigma: Record<string, number> = {};
    const d: Record<string, number> = {};
    nodes.forEach(t => { P[t.id] = []; sigma[t.id] = 0; d[t.id] = -1; });
    sigma[s.id] = 1; d[s.id] = 0;
    const Q: string[] = [s.id];
    while (Q.length > 0) {
      const v = Q.shift()!;
      S.push(v);
      adj.get(v)?.forEach(edge => {
        const w = edge.id;
        if (d[w] < 0) { Q.push(w); d[w] = d[v] + 1; }
        if (d[w] === d[v] + 1) { sigma[w] += sigma[v]; P[w].push(v); }
      });
    }
    const delta: Record<string, number> = {};
    nodes.forEach(v => delta[v.id] = 0);
    while (S.length > 0) {
      const w = S.pop()!;
      P[w].forEach(v => delta[v] += (sigma[v] / sigma[w]) * (1 + delta[w]));
      if (w !== s.id) CB[w] += delta[w];
    }
  });
  return CB;
};

const calculateCloseness = (nodes: GraphNode[], adj: Map<string, Array<{id: string, weight: number}>>) => {
  const CC: Record<string, number> = {};
  nodes.forEach(node => {
    const q: {id: string, d: number}[] = [{id: node.id, d: 0}];
    const visited = new Set([node.id]);
    let total = 0, count = 0;
    while(q.length) {
      const {id, d} = q.shift()!;
      if(d>0) { total += d; count++; }
      adj.get(id)?.forEach(n => {
         if(!visited.has(n.id)) { visited.add(n.id); q.push({id: n.id, d: d+1}); }
      });
    }
    CC[node.id] = count > 0 ? count/total : 0;
  });
  return CC;
};

// Main Runner
export const runAlgorithm = (type: string, data: GraphData, params: any, rawData?: { entities: RawEntity[], relations: RawRelation[] }) => {
  if (type === 'HIERARCHICAL') {
    const tree = calculateHierarchicalTree(data.nodes, data.links, params);
    return { tree };
  }
  if (type === 'KMEANS' && rawData) {
     return calculateVectorKMeans(rawData.entities, rawData.relations, params.targetType, params.k);
  }
  if (type === 'COMMUNITY' && rawData) {
     return calculateBipartiteCommunity(rawData.entities, rawData.relations, params.frontType, params.backType);
  }
  if (type === 'ASSOCIATION' && rawData) {
     return calculateAssociationRules(rawData.entities, rawData.relations, params.frontType, params.backType, params.minSupport, params.minConfidence);
  }
  if (type === 'CENTRALITY') {
    return calculateCentralityRankings(data.nodes, data.links);
  }
  return {};
};

// Co-occurrence Generator (Still needed for basic analysis graph)
export const generateCooccurrenceGraph = (entities: RawEntity[], relations: RawRelation[], containerType: string, itemType: string): GraphData => {
  const containerToItems = new Map<string, Set<string>>();
  const allItems = new Set<string>();
  relations.forEach(r => {
    const isSourceContainer = entities.find(e => e.name === r.source && e.type === containerType);
    const isTargetItem = entities.find(e => e.name === r.target && e.type === itemType);
    if (isSourceContainer && isTargetItem) {
      if (!containerToItems.has(r.source)) containerToItems.set(r.source, new Set());
      containerToItems.get(r.source)?.add(r.target);
      allItems.add(r.target);
    }
     // Handle reverse direction if needed
     const isTargetContainer = entities.find(e => e.name === r.target && e.type === containerType);
     const isSourceItem = entities.find(e => e.name === r.source && e.type === itemType);
     if (isTargetContainer && isSourceItem) {
       if (!containerToItems.has(r.target)) containerToItems.set(r.target, new Set());
       containerToItems.get(r.target)?.add(r.source);
       allItems.add(r.source);
     }
  });

  const nodes: GraphNode[] = Array.from(allItems).map(id => ({ id, group: itemType }));
  const edgesMap = new Map<string, number>();
  
  containerToItems.forEach(items => {
    const arr = Array.from(items);
    for(let i=0; i<arr.length; i++) {
      for(let j=i+1; j<arr.length; j++) {
        const k = arr[i] < arr[j] ? `${arr[i]}|${arr[j]}` : `${arr[j]}|${arr[i]}`;
        edgesMap.set(k, (edgesMap.get(k) || 0) + 1);
      }
    }
  });

  const links: GraphLink[] = [];
  edgesMap.forEach((w, k) => {
    const [s, t] = k.split('|');
    links.push({ source: s, target: t, type: 'co-occur', weight: w });
  });

  return { nodes, links };
};