/**
 * Created by Neo on 12/12/2016.
 */
// Node ----------------------------------------------------------------

function Node(nodeData) {
    // Metadata
    this.nodeId = nodeData['node_id'];
    this.twitterHandle = nodeData['twitter_handle'];
    this.twitterUserId = nodeData['twitter_user_id'];

    // Geometry (Final Position)
    this.fp = nodeData['final_coordinates'];
    // Embedding process
    this.ep = nodeData['embedding_process'];

    // Credibility
    this.verified = nodeData['verified'];
    this.journalist = nodeData['journalist'];

    // Polarity
    this.clinton = nodeData['clinton_follower'];
    this.trump = nodeData['trump_follower'];
    this.sanders = nodeData['sanders_follower'];

    // Issues
    this.terrorism = nodeData['terrorism'];
    this.immigration = nodeData['immigration'];
    this.guns = nodeData['guns'];
    this.education = nodeData['education'];
    this.jobs = nodeData['jobs'];
    this.seniorsSocialSecurity = nodeData['seniors_social_security'];
    this.racialIssues = nodeData['racial_issues'];
    this.economy = nodeData['economy'];

    // Network
    this.pagerank = nodeData['pagerank'];
    this.neighbors = [];
    THREE.Vector3.call( this, this.ep[0][0], this.ep[0][1], this.ep[0][2] );
}

Node.prototype = Object.create( THREE.Vector3.prototype );

function CreateNodes(nl){
    var nodes= new Map();
    for(var i=0; i<nl.length; i++){
        nodes.set( nl[i]['node_id'],new Node(nl[i]));
    }
    return nodes;
}

