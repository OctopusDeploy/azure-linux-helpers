# Set ProvisionGuestAgent Flag

A nodejs app thats set the `ProvisionGuestAgent` flag on an Azure VM.

Originally created as [Vagrant](https://vagrantup.com) and the [Vagrant-Azure](https://github.com/Azure/vagrant-azure) plugin create VMs without the Azure Guest Agent installed.

## Usage
```
$ node install-azure-guest-agent.js <service_name> <vm_name>
```

if service_name and vm_name are the same, service_name could be omitted:
```
$ node install-azure-guest-agent.js <vm_name>
```

## Licence

Originally based on [work by Microsoft](https://github.com/Azure/azure-linux-extensions/blob/17d89554ecbcab29d5a48bb6f689fa57586ab205/AzureEnhancedMonitor/nodejs/setaem.js), released under the Apache 2.0 license.

Modifications Copyright (C) 2017 Octopus Deploy, also released under the Apache 2.0 license.
