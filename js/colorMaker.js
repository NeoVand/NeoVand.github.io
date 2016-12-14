/**
 * Created by Neo on 12/12/2016.
 */


function nodeColors(node,vizParam){
    var polarity = vizParam['polarity'];
    var showVerified = vizParam['showVerified'];
    var showJournalist = vizParam['showJournalist'];
    var highlightMode = showVerified||showJournalist;
    var issueThreshold= vizParam['issueThreshold'];
    var normal = 0.05;

    if(isChecked()){
        var desat= vizParam['issueDesat'];
        var checked = [];
        var cols=[];
        for(let box of IssueBoxes){
            var token=box.slice(0,-3);
            if(vizParam[box] && node[token]>issueThreshold){
                checked.push(token);
                cols.push(vizParam[token]);
            }
        }
        var boxCount=checked.length;
        var sigNorm = vizParam['issueSignalStrength'];
        var sigDim = vizParam['issueDimmed'];
        if(boxCount>0){
            var issuefreq = 250;
            var phase = Math.PI/(2*boxCount);
            var blinkers = [...Array(boxCount).keys()].map(function (n) {
                return sigNorm*(0.55+0.5*Math.sin(issuefreq*tt+n*phase));
            });
            var colVals= checked.map(function(c,i){return blinkers[i]*node[c];});
            // var CCS= CS.map(function(c){return new ColorMix.Color(c[0], c[1], c[2]);});
            // var percentages = numToPercentage(NCS);
            // var mix = ColorMix.mix(CCS,percentages);
            var mix = colormix(cols,colVals,sigNorm);
            // return [mix.getRed(),mix.getGreen(),mix.getBlue()];
            return mix
        }
        else if(highlightMode){
            var highlighted = vizParam['highlighted'];
            var freq = 400;
            var blinkV = highlighted*(0.5+0.5*Math.sin(freq*tt));
            var blinkJ = highlighted*(0.5+0.5*Math.cos(freq*tt));
            if(showJournalist && showVerified )
            {
                if(node['verified']>0 && node['journalist']>0){
                    return colormix([vizParam['verified'],vizParam['journalist']],[blinkV,blinkJ],highlighted);
                }
                else if(node['verified']>0){
                    return colormix([vizParam['verified']],[blinkV],highlighted);
                }
                else if(node['journalist']>0){
                    return colormix([vizParam['journalist']],[blinkJ],highlighted);
                }
            }

            else if(showVerified && node['verified']>0){
                return colormix([vizParam['verified']],[blinkV],highlighted);
            }

            else if(showJournalist && node['journalist']>0){
                return colormix([vizParam['journalist']],[blinkJ],highlighted);
            }
            else if(polarity){
                var CC=colorDesat(vizParam['clinton'],desat);
                var TC=colorDesat(vizParam['trump'],desat);
                var SC=colorDesat(vizParam['sanders'],desat);
                var nC=node['clinton'];
                var nT=node['trump'];
                var nS=node['sanders'];
                if(nT+nC+nS>0){
                    //     var percentages= numToPercentage([nC,nT]);
                    //     var C1 = new ColorMix.Color(CC[0], CC[1], CC[2]),
                    //         C2 = new ColorMix.Color(TC[0], TC[1], TC[2]),
                    //         mix = ColorMix.mix([C1, C2],percentages);
                    //     return [mix.getRed(),mix.getGreen(),mix.getBlue()];
                    var mix = colormix([CC,TC,SC],[nC,nT,nS],sigDim);
                    // return [mix.getRed(),mix.getGreen(),mix.getBlue()];
                    return mix
                }
                else{
                    return colormix([vizParam['neither']],[1.],sigDim);
                }
            }
            else{
                var NCS= issueList.map(function(c){return 0.01*node[c];});
                var CS= issueList.map(function(c){return vizParam[c];});
                // var CCS= CS.map(function(c){return new ColorMix.Color(c[0], c[1], c[2]);});
                // var percentages = numToPercentage(NCS);
                // var mix = ColorMix.mix(CCS,percentages);
                var mix = colormix(CS,NCS,sigDim);
                // return [mix.getRed(),mix.getGreen(),mix.getBlue()];
                return mix
            }

        }
        else if(polarity){
            var CC=colorDesat(vizParam['clinton'],desat);
            var TC=colorDesat(vizParam['trump'],desat);
            var SC=colorDesat(vizParam['sanders'],desat);
            var nC=node['clinton'];
            var nT=node['trump'];
            var nS=node['sanders'];
            if(nT+nC+nS>0){
                //     var percentages= numToPercentage([nC,nT]);
                //     var C1 = new ColorMix.Color(CC[0], CC[1], CC[2]),
                //         C2 = new ColorMix.Color(TC[0], TC[1], TC[2]),
                //         mix = ColorMix.mix([C1, C2],percentages);
                //     return [mix.getRed(),mix.getGreen(),mix.getBlue()];
                var mix = colormix([CC,TC,SC],[nC,nT,nS],sigDim);
                // return [mix.getRed(),mix.getGreen(),mix.getBlue()];
                return mix
            }
            else{
                return colormix([vizParam['neither']],[1.],sigDim);
            }
        }
        else{
            var NCS= issueList.map(function(c){return 0.01*node[c];});
            var CS= issueList.map(function(c){return vizParam[c];});
            // var CCS= CS.map(function(c){return new ColorMix.Color(c[0], c[1], c[2]);});
            // var percentages = numToPercentage(NCS);
            // var mix = ColorMix.mix(CCS,percentages);
            var mix = colormix(CS,NCS,sigDim);
            // return [mix.getRed(),mix.getGreen(),mix.getBlue()];
            return mix
        }


    }

    else{
        var highlighted = vizParam['highlighted'];
        var freq = 400;
        var blinkV = highlighted*(0.5+0.5*Math.sin(freq*tt));
        var blinkJ = highlighted*(0.5+0.5*Math.cos(freq*tt));
        var dimmed = vizParam['dimmed'];
        var normal = 0.05;
        var polarity = vizParam['polarity'];
        var showVerified = vizParam['showVerified'];
        var showJournalist = vizParam['showJournalist'];

        var highlightMode = showVerified||showJournalist;
        if(highlightMode){
            if(showJournalist && showVerified )
            {
                if(node['verified']>0 && node['journalist']>0){
                    return colormix([vizParam['verified'],vizParam['journalist']],[blinkV,blinkJ],highlighted);
                }
                else if(node['verified']>0){
                    return colormix([vizParam['verified']],[blinkV],highlighted);
                }
                else if(node['journalist']>0){
                    return colormix([vizParam['journalist']],[blinkJ],highlighted);
                }
            }

            else if(showVerified && node['verified']>0){
                return colormix([vizParam['verified']],[blinkV],highlighted);
            }

            else if(showJournalist && node['journalist']>0){
                return colormix([vizParam['journalist']],[blinkJ],highlighted);
            }

            if(polarity){
                var CC=vizParam['clinton'];
                var TC=vizParam['trump'];
                var SC=vizParam['sanders'];
                var nC=node['clinton'];
                var nT=node['trump'];
                var nS=node['sanders'];
                if(nT+nC+nS>0){
                    //     var percentages= numToPercentage([nC,nT]);
                    //     var C1 = new ColorMix.Color(CC[0], CC[1], CC[2]),
                    //         C2 = new ColorMix.Color(TC[0], TC[1], TC[2]),
                    //         mix = ColorMix.mix([C1, C2],percentages);
                    //     return [mix.getRed(),mix.getGreen(),mix.getBlue()];
                    var mix = colormix([CC,TC,SC],[nC,nT,nS],dimmed);
                    // return [mix.getRed(),mix.getGreen(),mix.getBlue()];
                    return mix
                }
                else{
                    return colormix([vizParam['neither']],[1.],dimmed);
                }
            }
        }

        if(polarity){
            var CC=vizParam['clinton'];
            var TC=vizParam['trump'];
            var SC=vizParam['sanders'];
            var nC=node['clinton'];
            var nT=node['trump'];
            var nS=node['sanders'];
            if(nT+nC+nS>0){
                //     var percentages= numToPercentage([nC,nT]);
                //     var C1 = new ColorMix.Color(CC[0], CC[1], CC[2]),
                //         C2 = new ColorMix.Color(TC[0], TC[1], TC[2]),
                //         mix = ColorMix.mix([C1, C2],percentages);
                //     return [mix.getRed(),mix.getGreen(),mix.getBlue()];
                var mix = colormix([CC,TC,SC],[nC,nT,nS],normal);
                // return [mix.getRed(),mix.getGreen(),mix.getBlue()];
                return mix
            }
            else{
                return colormix([vizParam['neither']],[1.],normal);
            }
        }
        else{
            var NCS= issueList.map(function(c){return 0.01*node[c];});
            var CS= issueList.map(function(c){return vizParam[c];});
            // var CCS= CS.map(function(c){return new ColorMix.Color(c[0], c[1], c[2]);});
            // var percentages = numToPercentage(NCS);
            // var mix = ColorMix.mix(CCS,percentages);
            var mix = colormix(CS,NCS,normal);
            // return [mix.getRed(),mix.getGreen(),mix.getBlue()];
            return mix
        }
    }


}


function numToPercentage(nums){
    "use strict";
    let sum = nums.reduce((sum, x) => sum + x);
    let results=[];
    for(let num of nums){
        results.push(Math.floor(100*num/sum));
    }
    let total =  results.reduce((total, x) => total + x);
    if(total!=100){
        results[results.indexOf(Math.max(...results))]+=(100-total);
    }
    // console.log(results);
    return results;
}

function colormix(cs,ws,cf){

    var intenseWs=contraster(ws);
   var vecs =cs.map(function (d, i) {
      return new THREE.Vector3(...d).multiplyScalar(cf*vizController['nodeVisibility']*intenseWs[i]);
   });
   var vecSum = vecs.reduce(function (a,b) {
       return a.add(b)
   }, new THREE.Vector3(0,0,0));
    return [vecSum.x,vecSum.y,vecSum.z];
}

function contraster(ws){
    let wss=ws.slice(0);
    let wsss = wss.map(function (d) {
        return d/vizController["nodeContrast"];
    });
    let maxw=Math.max(...wsss);
    let intensified= maxw*vizController["nodeContrast"]*vizController["nodeContrast"];
    wsss[wsss.indexOf(maxw)]=intensified;
    return wsss;
}

function colorDesat(clist,desat){
        var [r,g,b]=clist;
        var intensity = 0.3 * r + 0.59 * g + 0.11 * b;
        var k = desat;
        r = Math.floor(intensity * k + r * (1 - k));
        g = Math.floor(intensity * k + g * (1 - k));
        b = Math.floor(intensity * k + b * (1 - k));
        return [r, g, b];
}