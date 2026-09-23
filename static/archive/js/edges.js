/**
 * Created by Neo on 12/12/2016.
 */
// Edge ----------------------------------------------------------------

function Edge(edgeData,nodeMap) {
    // Metadata
    this.sourceNodeId = edgeData['source'];
    this.targetNodeId = edgeData['target'];
    this.source = nodeMap.get(this.sourceNodeId);
    this.target = nodeMap.get(this.targetNodeId);

    // Issues
    this.terrorism = edgeData['type']['terrorism'];
    this.immigration = edgeData['type']['immigration'];
    this.guns = edgeData['type']['guns'];
    this.education = edgeData['type']['education'];
    this.jobs = edgeData['type']['jobs'];
    this.seniorsSocialSecurity = edgeData['type']['seniors_social_security'];
    this.racialIssues = edgeData['type']['racial_issues'];
    this.economy = edgeData['type']['economy'];


    THREE.LineCurve3.call( this, this.source, this.target);
}

Edge.prototype = Object.create( THREE.LineCurve3.prototype );

function CreateEdges(el,nodeMap){
    var edges=[];
    for(var i=0; i<el.length; i++){
        edges.push(new Edge(el[i],nodeMap));
    }
    return edges;
}