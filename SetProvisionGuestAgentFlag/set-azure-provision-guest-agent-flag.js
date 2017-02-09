#!/usr/bin/env node

//
// Copyright (c) Microsoft and contributors.  All rights reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//   http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//
// See the License for the specific language governing permissions and
// limitations under the License.
//


'use strict';

var fs = require('fs');
var path = require('path');
var Promise = require('promise');
var common = require('azure-common');
var computeMgmt = require('azure-asm-compute');
var azure = require('azure');
var readFile = Promise.denodeify(fs.readFile); 
var debug = 0;
var CurrentScriptVersion = "1.0.0.0";

var setProvisionGuestAgent = function(svcName, vmName){
    var computeClient;
    var selectedVM;

    return getAzureProfile().then(function(profile){
        return getDefaultSubscription(profile);
    }).then(function(subscription){
        console.log("[INFO]Using subscription: " + subscription.name);
        debug && console.log(JSON.stringify(subscription, null, 4));
        var cred = getCloudCredential(subscription);
        var baseUri = subscription.managementEndpointUrl;
        computeClient = computeMgmt.createComputeManagementClient(cred, baseUri);
    }).then(function(){
        return getVirtualMachine(computeClient, svcName, vmName);
    }).then(function(vm){
        //Set vm role basic config
        console.log("[INFO]Found VM: " + vm.roleName);
        debug && console.log(JSON.stringify(vm, null, 4));
        selectedVM = vm;
    }).then(function(){
        //Update vm
        selectedVM.provisionGuestAgent = true;
        console.log("[INFO]Updating configuration for VM: " + selectedVM.roleName);
        console.log("[INFO]This could take a few minutes. Please wait.")
        debug && console.log(JSON.stringify(selectedVM, null, 4)) 
        return updateVirtualMachine(computeClient, svcName, vmName, selectedVM);
    });
}

var updateVirtualMachine = function (client, svcName, vmName, parameters){
    return new Promise(function(fullfill, reject){
        client.virtualMachines.update(svcName, svcName, vmName, parameters, 
                                      function(err, ret){
            if(err){
                reject(err)
            } else {
                fullfill(ret);
            }
        });
    });
}

var getVirtualMachine = function(computeClient, svcName, vmName){
    return new Promise(function(fullfill, reject){
        computeClient.virtualMachines.get(svcName, svcName, vmName, 
                                            function(err, res){
            if(err){
                reject(err);
            } else {
                fullfill(res);
            }
        });
    });
}

var getCloudCredential = function(subscription){
    var cred;
    if(subscription.credential.type === 'cert'){
        cred = new azure.CertificateCloudCredentials({
            subscriptionId:subscription.id ,
            cert:subscription.managementCertificate.cert,
            key:subscription.managementCertificate.key,
        });
    }else{//if(subscription.credential.type === 'token'){
       cred = new common.TokenCloudCredentials({
            subscriptionId : subscription.id,
            token : subscription.credential.token
       });
    } 
    return cred;
}

var getAzureProfile = function(){
    var profileJSON = path.join(getUserHome(), ".azure/azureProfile.json");
    return readFile(profileJSON).then(function(result){
        var profile = JSON.parse(result);
        return profile;
    });
}

var getDefaultSubscription = function(profile){
    debug && console.log(JSON.stringify(profile, null, 4))
    if(profile == null || profile.subscriptions == null 
            || profile.subscriptions.length == 0){
        throw "No subscription found."
    }
    console.log("[INFO]Found available subscriptions:");
    console.log("[INFO]");
    console.log("[INFO]    Id\t\t\t\t\t\tName");
    console.log("[INFO]    --------------------------------------------------------");
    profile.subscriptions.forEach(function(subscription){
        console.log("[INFO]    " + subscription.id + "\t" + subscription.name);
    });
    console.log("[INFO]");
    var defaultSubscription;
    profile.subscriptions.every(function(subscription){
        if(subscription.isDefault){
            defaultSubscription = subscription;
            return false;
        } else {
            return true;
        }
    });

    if(defaultSubscription == null){
        console.log("[WARN]No subscription is selected.");
        defaultSubscription = profile.subscriptions[0];
        console.log("[INFO]The first subscription will be used.");
        console.log("[INFO]You could use the following command to select another subscription.");
        console.log("[INFO]");
        console.log("[INFO]    azure account set [<subscript_id>|<subscript_name>]");
        console.log("[INFO]");
    }
    if(defaultSubscription.managementCertificate){
        return getCertCredential(defaultSubscription);
    } else if(defaultSubscription.user){
        return getTokenCredential(defaultSubscription);
    } else {
        throw "Unknown subscription type.";
    }
}

var getTokenCredential = function(subscription){
    var tokensJSON = path.join(getUserHome(), ".azure/accessTokens.json");
    return readFile(tokensJSON).then(function(result){
        var tokens = JSON.parse(result);
        tokens.every(function(token){
            if(token.userId === subscription.user.name){
                subscription.credential = {
                    type : 'token',
                    token : token.accessToken
                };
                return false
            }
        });
        return subscription;
    });
}

var getCertCredential = function(subscription){
    subscription.credential = {
        type : 'cert',
        cert : subscription.managementCertificate
    };
    return subscription;
}

function getUserHome() {
  return process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];
}

var main = function(){
    var svcName = null;
    var vmName = null;
    if(process.argv.length === 4){
        vmName = process.argv[3];
        svcName = process.argv[2];
    } else if(process.argv.length === 3){
        if(process.argv[2] === "--help" || process.argv[2] === "-h"){
            usage();
            process.exit(0);
        } else if(process.argv[2] === "--version" || process.argv[2] === "-v"){
            console.log(CurrentScriptVersion);
            process.exit(0);
        }
        vmName = process.argv[2];
        svcName = vmName;
    } else{
        usage();
        process.exit(1);
    }

    setProvisionGuestAgent(svcName, vmName).done(function(){
        console.log("[INFO]Azure ProvisionGuestAgent status updated.");
        process.exit(0);
    }, function(err){
        if(err && err.statusCode == 401){
            console.error("[ERROR]Token expired. Please run the following command to login.");
            console.log("[ERROR]    ");
            console.log("[ERROR]    azure login");
            console.log("[ERROR]or");
            console.log("[ERROR]    azure account import <pem_file>");
            process.exit(-1);
        }else{
            console.log(err);
            console.log(err.stack);
            process.exit(-1);
        }
    });
}

var usage = function(){
    console.log("");
    console.log("Usage:");
    console.log("    node install-azure-guest-agent.js <service_name> <vm_name>");
    console.log("or");
    console.log("    node install-azure-guest-agent.js <vm_name>");
    console.log("");
    console.log("  *if service_name and vm_name are the same, service_name could be omitted.");
    console.log("");
    console.log("    ");
    console.log("    -h, --help ");
    console.log("        Print help.");
    console.log("    ");
    console.log("    -v, --version");
    console.log("        Print version.");
    console.log("    ");
}

main();
