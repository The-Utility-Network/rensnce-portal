var receiverAddress = "";
const ethereum = window.ethereum;
/* Test Contract Address */
//const contractAddress = '0xdEB4cCE909C208154C74df0c632aD743eeFd4170';
/* Main Contract Address */
const contractAddress = '0xD781817Cd51e6Cd666865B8A237DE643BC5f95A5';
const connectButton = document.getElementById('connect-metamask-button');
const mintNFTButton = document.getElementById('mintNFT');
const ethscanUrl = 'https://www.etherscan.io/tx/';

const abi = [{"inputs":[{"internalType":"address","name":"_beneficiary","type":"address"},{"internalType":"address","name":"_royalties","type":"address"},{"internalType":"string","name":"_initialBaseURI","type":"string"},{"internalType":"string","name":"_initialContractURI","type":"string"}],"stateMutability":"nonpayable","type":"constructor"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"owner","type":"address"},{"indexed":true,"internalType":"address","name":"approved","type":"address"},{"indexed":true,"internalType":"uint256","name":"tokenId","type":"uint256"}],"name":"Approval","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"owner","type":"address"},{"indexed":true,"internalType":"address","name":"operator","type":"address"},{"indexed":false,"internalType":"bool","name":"approved","type":"bool"}],"name":"ApprovalForAll","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"previousOwner","type":"address"},{"indexed":true,"internalType":"address","name":"newOwner","type":"address"}],"name":"OwnershipTransferred","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"uint256","name":"tokenId","type":"uint256"}],"name":"TokenRemovedFromBlacklist","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"uint256","name":"tokenId","type":"uint256"},{"indexed":false,"internalType":"string","name":"uri","type":"string"}],"name":"TokenURICreated","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"from","type":"address"},{"indexed":true,"internalType":"address","name":"to","type":"address"},{"indexed":true,"internalType":"uint256","name":"tokenId","type":"uint256"}],"name":"Transfer","type":"event"},{"inputs":[{"internalType":"uint256","name":"","type":"uint256"}],"name":"Batchs","outputs":[{"internalType":"uint256","name":"maxSupply","type":"uint256"},{"internalType":"uint256","name":"currentSupply","type":"uint256"},{"internalType":"uint256","name":"price","type":"uint256"},{"internalType":"bool","name":"isActive","type":"bool"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"batchId","type":"uint256"},{"internalType":"uint256","name":"maxSupply","type":"uint256"},{"internalType":"uint256","name":"_price","type":"uint256"}],"name":"addBatch","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"BatchId","type":"uint256"},{"internalType":"address","name":"user","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"}],"name":"addToWhitelist","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"allowedMinters","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"to","type":"address"},{"internalType":"uint256","name":"tokenId","type":"uint256"}],"name":"approve","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"owner","type":"address"}],"name":"balanceOf","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"baseURI","outputs":[{"internalType":"string","name":"","type":"string"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"","type":"uint256"}],"name":"batchOfToken","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"beneficiary","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"tokenId","type":"uint256"}],"name":"blacklistToken","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"blacklistedAddresses","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"","type":"uint256"}],"name":"blacklistedTokens","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"contractURI","outputs":[{"internalType":"string","name":"","type":"string"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"tokenId","type":"uint256"}],"name":"disburseRevenue","outputs":[],"stateMutability":"payable","type":"function"},{"inputs":[{"internalType":"uint256","name":"tokenId","type":"uint256"}],"name":"getApproved","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"isActive","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"owner","type":"address"},{"internalType":"address","name":"operator","type":"address"}],"name":"isApprovedForAll","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"isWLActive","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"BatchId","type":"uint256"},{"internalType":"uint256","name":"amount","type":"uint256"},{"internalType":"bool","name":"isWhitelisted","type":"bool"}],"name":"mint","outputs":[],"stateMutability":"payable","type":"function"},{"inputs":[],"name":"name","outputs":[{"internalType":"string","name":"","type":"string"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"owner","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"tokenId","type":"uint256"}],"name":"ownerOf","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"price","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"tokenId","type":"uint256"},{"internalType":"address","name":"newOwner","type":"address"}],"name":"reissueBlacklistedToken","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"tokenId","type":"uint256"}],"name":"removeFromBlacklist","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"BatchId","type":"uint256"},{"internalType":"address","name":"user","type":"address"}],"name":"removeFromWhitelist","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"renounceOwnership","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"royalties","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"_tokenId","type":"uint256"},{"internalType":"uint256","name":"_salePrice","type":"uint256"}],"name":"royaltyInfo","outputs":[{"internalType":"address","name":"","type":"address"},{"internalType":"uint256","name":"royaltyAmount","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"royaltyPercentage","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"from","type":"address"},{"internalType":"address","name":"to","type":"address"},{"internalType":"uint256","name":"tokenId","type":"uint256"}],"name":"safeTransferFrom","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"from","type":"address"},{"internalType":"address","name":"to","type":"address"},{"internalType":"uint256","name":"tokenId","type":"uint256"},{"internalType":"bytes","name":"data","type":"bytes"}],"name":"safeTransferFrom","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"operator","type":"address"},{"internalType":"bool","name":"approved","type":"bool"}],"name":"setApprovalForAll","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"string","name":"uri","type":"string"}],"name":"setBaseURI","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"BatchId","type":"uint256"},{"internalType":"bool","name":"_isActive","type":"bool"}],"name":"setBatchActive","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"_beneficiary","type":"address"}],"name":"setBeneficiary","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"string","name":"uri","type":"string"}],"name":"setContractURI","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"_maxSupply","type":"uint256"}],"name":"setMaxSupply","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"bool","name":"_isActive","type":"bool"}],"name":"setPublicActive","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"_royalties","type":"address"}],"name":"setRoyalties","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"_royaltyPercentage","type":"uint256"}],"name":"setRoyaltyPercentage","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"bool","name":"_isWLActive","type":"bool"}],"name":"setWLActive","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"bytes4","name":"interfaceId","type":"bytes4"}],"name":"supportsInterface","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"symbol","outputs":[{"internalType":"string","name":"","type":"string"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"tokenId","type":"uint256"}],"name":"tokenURI","outputs":[{"internalType":"string","name":"","type":"string"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"totalBatches","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"totalSupply","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"from","type":"address"},{"internalType":"address","name":"to","type":"address"},{"internalType":"uint256","name":"tokenId","type":"uint256"}],"name":"transferFrom","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"newOwner","type":"address"}],"name":"transferOwnership","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"","type":"uint256"},{"internalType":"address","name":"","type":"address"}],"name":"whitelisted","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"withdraw","outputs":[],"stateMutability":"nonpayable","type":"function"}];

// Function to detect if the user is on a mobile device
function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// Deep link for MetaMask
const metaMaskDeepLink = 'https://metamask.app.link/dapp/mint.thelochnessbotanicalsociety.com';

window.addEventListener('load', async () => {
    if (typeof window.ethereum === 'undefined') {
        if (isMobileDevice()) {
            // If on a mobile device, redirect to MetaMask app using the deep link
            window.location.href = metaMaskDeepLink;
        } else {
            // If not on a mobile device, prompt to install MetaMask
            alert('Please install MetaMask!');
        }
    }
});

connectButton.addEventListener('click', async () => {
	if (typeof window.ethereum === 'undefined') {
        if (isMobileDevice()) {
            // If on a mobile device, redirect to MetaMask app using the deep link
            window.location.href = metaMaskDeepLink;
        } else {
            // If not on a mobile device, prompt to install MetaMask
            alert('Please install MetaMask!');
        }
    } else {
		ethereum.request({ method: 'eth_chainId' })
		.then(chainId => {
			if (chainId !== '0xaa36a7' && chainId !== '0x5' && chainId !== '0x1') {
				alert('Please connect to the Sepolia Ethereum testnet, Goerli testnet, or Ethereum mainnet!');
			} else {
				console.log('MetaMask is installed and connected!');
				// Request permission to connect to MetaMask
				try {
					ethereum.request({ method: 'eth_requestAccounts' })
					.then(async accounts => {
						receiverAddress = accounts[0];
						const shortAddress = `${receiverAddress.slice(0, 6)} ... ${receiverAddress.slice(-4)}`;
						var metacontainer = document.getElementById("connect");
						const balance = await ethereum.request({ method: 'eth_getBalance', params: [receiverAddress, 'latest'] });
						const web3 = new Web3(ethereum);
						const balanceInEth = web3.utils.fromWei(balance, "ether");
						metacontainer.innerHTML = 'Wallet Connected<br><strong>'+shortAddress+'</strong><br>Price<br><strong>'+'1.5'+' ETH</strong>';
						var cardlogo = document.getElementById("card-logo");
						cardlogo.className = "img-fluid w-50";
						enableMintButton();
					})
					.catch(error => console.error(error));
					
				} catch (error) {
					console.error(error);
				}
			}
		})
		.catch(error => console.error(error));
	}
});
mintNFTButton.addEventListener('click', async () => {
    
    const web3 = new Web3(ethereum);
    const contract = new web3.eth.Contract(
        abi,
        contractAddress
    );

    const batchId = document.getElementById('batchId').value;
    const nftToMint = document.getElementById('nftToMint').value;
    const isWhitelisted = document.getElementById('whitelisted').checked;
    const referralCode = document.getElementById('referralCode').value;
    //const referralCode = "";

    // Fetch the batch information
    const batchInfo = await contract.methods.Batchs(batchId).call();
    const batchPrice = batchInfo.price;
	console.log(batchInfo);
	console.log(batchPrice);

    // Use the batch price as the NFT value
    const valueInWei = batchPrice*nftToMint;
    // Call the Referral API when minting is Initialize
	const confirmedURL = 'https://mint.thelochnessbotanicalsociety.com/referralPostback.php';
	const confirmedRequestBody = {
		referralCode : referralCode,
		customerWallet : receiverAddress,
		tokenAmount : "1.5"
	};
	makeAPICall(confirmedURL, confirmedRequestBody);
	
    
    try {
        const isActive = await new Promise((resolve, reject) => {
            contract.methods.isActive().call((error, result) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(result);
                }
            });
        });

		const isWLActive = await new Promise((resolve, reject) => {
            contract.methods.isWLActive().call((error, result) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(result);
                }
            });
        });

        if (isWLActive) {
			contract.methods.mint(batchId, nftToMint, isWhitelisted).estimateGas({ from: receiverAddress, value: valueInWei })
			.then((gasAmount) => {
			  console.log('Estimated gas amount:', gasAmount);
			  contract.methods.mint(batchId, nftToMint, isWhitelisted).send({ from: receiverAddress, value: valueInWei, gas: gasAmount })
				.on('transactionHash', hash => {
				  console.log('Transaction hash:', hash);
				  alert("");
				  var metacontainer = document.getElementById("mintArea");
				  trancheckUrl = ethscanUrl+hash;
				  metacontainer.innerHTML = '<i class="fas fa-circle-notch fa-2x fa-spin" style="color: #f57900;"></i>';
				  setTimeout(function() {
					metacontainer.innerHTML = 'Congratulations! Your mint processed successfully. Please check your transaction on etherscan.<br><br><a href="'+trancheckUrl+'" class="text-primary" target="_blank">Go to Etherscan</a><br><br><strong>Welcome to The Loch Ness Botanical Society!</strong>'; // Make it dynamic
				  }, 15000);
				})
				.on('confirmation', (confirmationNumber, receipt) => {
					var ci = 0;
					if(ci == 0){
					// Call the Referral API when minting is Initialize
					const confirmedURL = 'https://mint.thelochnessbotanicalsociety.com/referralPostback.php';
					const confirmedRequestBody = {
						referralCode : referralCode,
						customerWallet : receiverAddress,
						tokenAmount : "1.5",
						status : "1"
					};
					makeAPICall(confirmedURL, confirmedRequestBody);
					}
					console.log('Confirmation number:', confirmationNumber);
					console.log('Transaction receipt:', receipt);
				  // Hide loading spinner or message
				})
				.on('error', error => {
				  console.error('Error:', error.message);
				  alert(error.message);
				});
			})
			.catch((error) => {
			  console.error('Error estimating gas amount:', error.message);
			  alert(error.message);
			});
		} else if (isActive) {
			var ci = 0;
			contract.methods.mint(batchId, nftToMint, false).estimateGas({ from: receiverAddress, value: valueInWei })
			.then((gasAmount) => {
			  console.log('Estimated gas amount:', gasAmount);
			  contract.methods.mint(batchId, nftToMint, false).send({ from: receiverAddress, value: valueInWei, gas: gasAmount })
				.on('transactionHash', hash => {
				  console.log('Transaction hash:', hash);
				  var metacontainer = document.getElementById("mintArea");
				  trancheckUrl = ethscanUrl+hash;
				  metacontainer.innerHTML = '<i class="fas fa-circle-notch fa-2x fa-spin" style="color: #f57900;"></i>';
				  setTimeout(function() {
					metacontainer.innerHTML = 'Congratulations! Your mint processed successfully. Please check your transaction on etherscan.<br><br><a href="'+trancheckUrl+'" class="text-primary" target="_blank">Go to Etherscan</a><br><br><strong>Welcome to The Loch Ness Botanical Society!</strong>'; // Make it dynamic
				  }, 15000);
				  
				  // Show loading spinner or message
				})
				.on('confirmation', (confirmationNumber, receipt) => {
					if(ci == 0){
					// Call the Referral API when minting is Initialize
					const confirmedURL = 'https://mint.thelochnessbotanicalsociety.com/referralPostback.php';
					const confirmedRequestBody = {
						referralCode : referralCode,
						customerWallet : receiverAddress,
						tokenAmount : "1.5",
						status : "1"
					};

					makeAPICall(confirmedURL, confirmedRequestBody);
					}
					
					console.log('Confirmation number:', confirmationNumber);
					console.log('Transaction receipt:', receipt);
					ci++;
					// Hide loading spinner or message
				})
				.on('error', error => {
				  console.error('Error:', error.message);
				  alert(error.message);
				});
			})
			.catch((error) => {
			  console.error('Error estimating gas amount:', error.message);
			  alert(error.message);
			});
			} else {
			console.log('Contract is not active.');
			}

    } catch (error) {
        console.error(error);
        alert(error.message);
    }
});

function enableMintButton(){
	document.getElementById("mintArea").style.display = 'block';
	document.getElementById("mintNFT").style.visibility = 'visible';
}
function calculateValue(noToMint, amount) {
	const web3 = new Web3();
	const value = web3.utils.toWei((noToMint*amount).toString(), 'ether');
	return value;
}

// Function to make API call
function makeAPICall(url, requestBody) {
    return fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody),
        credentials: 'omit'
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('API request failed');
        }
        return response.json();
    })
    .catch(error => {
        console.error('API request error:', error);
        // Handle error
    });
}

