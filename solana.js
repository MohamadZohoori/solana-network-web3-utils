import solanaweb3 from "@solana/web3.js";
import bs58 from "bs58";
import {PublicKey, clusterApiUrl, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { exec } from "child_process"
import { createMint, getOrCreateAssociatedTokenAccount, mintTo, transfer } from '@solana/spl-token';
import {getAccount, createAccount} from "@solana/spl-token";
import * as splToken from "@solana/spl-token"
import { web3, Wallet } from "@project-serum/anchor";

// import {Connection} from "@solana/web3.js";


const Mainnet = "mainnet-beta"
const Testnet = "testnet"
const Devnet = "devnet"
const Lamports_per_signature = 5000


function Connection(network){
  let connection = new solanaweb3.Connection(solanaweb3.clusterApiUrl(network));
  return connection
}


function CreateWallet(){
  let wallet = solanaweb3.Keypair.generate();
  return wallet
}


function PubKeyFromSecretKey(SecretKey){
  let pubKey = solanaweb3.Keypair.fromSecretKey(
    bs58.decode(SecretKey)
  ); 
  return pubKey
}


function WalletToPubKey(Wallet){
  return Wallet.publicKey
}


function RawPublicKeyToSolanaFormat(rawPubKey){
  let owner = new PublicKey(rawPubKey);
  return owner
}



function AddressIsOnNetwork(walletPubKey){
  return PublicKey.isOnCurve(walletPubKey.toBytes())
}



async function balance(walletPubKey,connection){
  let balance = await connection.getBalance(walletPubKey);
  console.log(balance);
  return balance
 };




async function sol_transfer_tx(connection,receiverWallet,payer){
  let minRent = await connection.getMinimumBalanceForRentExemption(0);
  let blockhash = await connection
    .getLatestBlockhash()
    .then((res) => res.blockhash);

  const instructions = [
      solanaweb3.SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: receiverWallet.publicKey,
        lamports: minRent,
      }),
    ];

  const messageV0 = new solanaweb3.TransactionMessage({
      payerKey: payer.publicKey,
      recentBlockhash: blockhash,
      instructions,
    }).compileToV0Message();

  const transaction = new solanaweb3.VersionedTransaction(messageV0);
  // sign your transaction with the required `Signers`
  transaction.sign([payer]);

  const txid = await connection.sendTransaction(transaction);
  console.log(`https://explorer.solana.com/tx/${txid}?cluster=devnet`);
}




function TXFeesFromCLI(){
  exec("solana fees", (error, stdout, stderr) => {
    if (error) {
        console.log(`error: ${error.message}`);
        return;
    }
    if (stderr) {
        console.log(`stderr: ${stderr}`);
        return;
    }
    console.log(`stdout: ${stdout.slice(stdout.search('Lamports per signature:')+23,stdout.search('Last valid block height:'))}`);
    // return `stdout: ${stdout.slice(stdout.search('Lamports per signature:')+23,stdout.search('Last valid block height:'))}`;
});
}


async function MintTokenAndTransfer(payer,receiverWallet){
    // Connect to cluster
    const connection = new solanaweb3.Connection(clusterApiUrl('devnet'), 'confirmed');

    // Generate a new wallet keypair and airdrop SOL
    const fromWallet = payer;
    const fromAirdropSignature = await connection.requestAirdrop(fromWallet.publicKey,  LAMPORTS_PER_SOL);

    // Wait for airdrop confirmation
    let latestBlockHash =  await connection.getLatestBlockhash()

    await connection.confirmTransaction({
        blockhash: latestBlockHash.blockhash,
        lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
        signature: fromAirdropSignature,
    });

    // Generate a new wallet to receive newly minted token
    const toWallet = receiverWallet;

    // Create new token mint
    const mint = await createMint(connection, fromWallet, fromWallet.publicKey, null, 9);
    console.log(mint,fromWallet.publicKey)
    

    // const mint = new PublicKey('2tWC4JAdL4AxEFJySziYJfsAnW2MHKRo98vbAPiRDSk8');
    // console.log(mint)

    // Get the token account of the fromWallet address, and if it does not exist, create it
    const fromTokenAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        fromWallet,
        mint,
        fromWallet.publicKey
    );

    // Get the token account of the toWallet address, and if it does not exist, create it
    const toTokenAccount = await getOrCreateAssociatedTokenAccount(connection, fromWallet, mint, toWallet.publicKey);

    // Mint 1 new token to the "fromTokenAccount" account we just created
    let signature = await mintTo(
        connection,
        fromWallet,
        mint,
        fromTokenAccount.address,
        fromWallet.publicKey,
        1000000000
    );
    console.log('mint tx:', signature);

    // Transfer the new token to the "toTokenAccount" we just created
    signature = await transfer(
        connection,
        fromWallet,
        fromTokenAccount.address,
        toTokenAccount.address,
        fromWallet.publicKey,
        50,
        [fromWallet, toWallet]
    );
    console.log('signature:', signature)

}




async function transferCustomToken(tokenMintAddress, wallet, to, connection, amount) {

  const mintPublicKey = new solanaweb3.PublicKey(tokenMintAddress);  
  const {TOKEN_PROGRAM_ID} = splToken
  
  const fromTokenAccount = await splToken.getOrCreateAssociatedTokenAccount(
    connection,
    wallet.payer,
    mintPublicKey,
    wallet.publicKey
  );

  // const destPublicKey = new web3.PublicKey(to);
  console.log(wallet.publicKey, to.publicKey)
  // Get the derived address of the destination wallet which will hold the custom token
  const associatedDestinationTokenAddr = await splToken.getOrCreateAssociatedTokenAccount(
    connection,
    wallet.payer,
    mintPublicKey,
    to.publicKey
  );
  
  const receiverAccount = await connection.getAccountInfo(associatedDestinationTokenAddr.address);    
  const instructions = solanaweb3.TransactionInstruction = [];  

  instructions.push(
    splToken.createTransferInstruction(
      fromTokenAccount.address,
      associatedDestinationTokenAddr.address,
      wallet.publicKey,
      amount,
      [],
      TOKEN_PROGRAM_ID
    )
  );

  const transaction = new solanaweb3.Transaction().add(...instructions);
  transaction.feePayer = wallet.publicKey;
  transaction.recentBlockhash = (await connection.getRecentBlockhash()).blockhash;
  
  var signature = await web3.sendAndConfirmTransaction(
    connection,
    transaction,
    [wallet]
);
    console.log(signature)

}



async function getTokenBalance(walletPubkey, MINT, connection){
  const auxiliaryTokenAccount = await splToken.getAssociatedTokenAddress(MINT, walletPubkey)
  const auxAccountInfo = await getAccount(connection, auxiliaryTokenAccount, "confirmed");
  console.log(auxAccountInfo.amount);
  return auxAccountInfo.amount;
}


async function gasFee(payer, receiverWallet, connection){
  // const mintPublicKey = new solanaweb3.PublicKey(tokenMintAddress);  
  // const {TOKEN_PROGRAM_ID} = splToken
  
  // const fromTokenAccount = await splToken.getOrCreateAssociatedTokenAccount(
  //   connection,
  //   payer.payer,
  //   mintPublicKey,
  //   payer.publicKey
  // );

  // // const destPublicKey = new web3.PublicKey(to);
  // console.log(wallet.publicKey, to.publicKey)
  // // Get the derived address of the destination wallet which will hold the custom token
  // const associatedDestinationTokenAddr = await splToken.getOrCreateAssociatedTokenAccount(
  //   connection,
  //   payer.payer,
  //   mintPublicKey,
  //   payee.publicKey
  // );
  
  // const receiverAccount = await connection.getAccountInfo(associatedDestinationTokenAddr.address);    
  // const instructions = solanaweb3.TransactionInstruction = [];  

  // instructions.push(
  //   splToken.createTransferInstruction(
  //     fromTokenAccount.address,
  //     associatedDestinationTokenAddr.address,
  //     wallet.publicKey,
  //     amount,
  //     [],
  //     TOKEN_PROGRAM_ID
  //   )
  // );
  // const recentBlockhash = await connection.getLatestBlockhash();
  // const transaction = new solanaweb3.Transaction().add(...instructions);

  let minRent = await connection.getMinimumBalanceForRentExemption(0);
  let blockhash = await connection
    .getLatestBlockhash()
    .then((res) => res.blockhash);

  const instructions = [
      solanaweb3.SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: receiverWallet.publicKey,
        lamports: minRent,
      }),
    ];

  const messageV0 = new solanaweb3.TransactionMessage({
      payerKey: payer.publicKey,
      recentBlockhash: blockhash,
      instructions,
    }).compileToV0Message();

  const transaction = new solanaweb3.VersionedTransaction(messageV0);
  console.log(transaction.signatures.length * Lamports_per_signature);
  return(transaction.signatures.length * Lamports_per_signature);
  // transaction.recentBlockhash = blockhash;
  // console.log(transaction)
  // const fees = await transaction.getEstimatedFee(connection);
  // console.log(`Estimated SOL transfer cost: ${fees} lamports`);
}


async function tx_data(connection, signature){
  let tx = await connection.getTransaction(
      signature,
      { maxSupportedTransactionVersion: 0 }
    )
  // console.log(tx)
  let sender = tx.transaction.message.accountKeys[0]
  let receiver = tx.transaction.message.accountKeys[1]
  let fee = tx.meta.fee

  const result = [sender, receiver, fee] 
  return result
}


function logEvent(connection, pubkey){
  connection.onLogs(pubkey, async (log) => {
    console.log(log.signature);
  }, 'finalized');
}























// Testing tx_data

// const connection = Connection(Devnet);
// const signature = "cE6eJSctieGsxKYMmydywxGkwinrK68tESLiU6eu3u6Nw8XYQ3KRyjYbjNgE9UT86YyigygWo6MchURtuCU5zZE"
// let TXData = await tx_data(connection, signature)
// console.log(TXData)





// Testing sol_transfer_tx

// const connection = Connection(Devnet);
// let payer = Keypair.fromSecretKey(
//   bs58.decode('5HGnVP4EQpkfSnzEz7jbjUa6ZVv2J7SBaW4XeUVNVKGV2MhNZvw71uq4sE6yvoFz5tQQCbTheUKz588L9dJtJuD6')
// ); 
// let receiverWallet = Keypair.fromSecretKey(
//   bs58.decode('25wWPU1Mqyt39TTE1TsYaECTVWntcpVX2bBveKwYCSjK54nAb7hn77JNe3QxfztQDbyr9brwDmvrWZvM1cSSzuY6')
// );
// sol_transfer_tx(connection,receiverWallet,payer)




// Testing gas fees

// const connection = Connection(Devnet);
// let wallet = Keypair.fromSecretKey(
//   bs58.decode('5HGnVP4EQpkfSnzEz7jbjUa6ZVv2J7SBaW4XeUVNVKGV2MhNZvw71uq4sE6yvoFz5tQQCbTheUKz588L9dJtJuD6')
// ); 
// let to = Keypair.fromSecretKey(
//   bs58.decode('25wWPU1Mqyt39TTE1TsYaECTVWntcpVX2bBveKwYCSjK54nAb7hn77JNe3QxfztQDbyr9brwDmvrWZvM1cSSzuY6')
// );
// const tokenMintAddress = new solanaweb3.PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
// gasFee(tokenMintAddress, wallet, to, connection, 5000)




// Testing Solana Token Balance 

// const connection = Connection(Devnet);
// const tokenMintAddress = new solanaweb3.PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
// let wallet = Keypair.fromSecretKey(
//   bs58.decode('5HGnVP4EQpkfSnzEz7jbjUa6ZVv2J7SBaW4XeUVNVKGV2MhNZvw71uq4sE6yvoFz5tQQCbTheUKz588L9dJtJuD6')
// );
// let walletPubkey = WalletToPubKey(wallet)
// console.log(walletPubkey, tokenMintAddress)
// getTokenBalance( walletPubkey, tokenMintAddress, connection)



// Testing the Token Transfer

// const connection = Connection(Devnet);
// const tokenMintAddress = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
// // const wallet = Keypair.generate();
// let wallet = Keypair.fromSecretKey(
//   bs58.decode('5HGnVP4EQpkfSnzEz7jbjUa6ZVv2J7SBaW4XeUVNVKGV2MhNZvw71uq4sE6yvoFz5tQQCbTheUKz588L9dJtJuD6')
// ); 
// let to = Keypair.fromSecretKey(
//   bs58.decode('25wWPU1Mqyt39TTE1TsYaECTVWntcpVX2bBveKwYCSjK54nAb7hn77JNe3QxfztQDbyr9brwDmvrWZvM1cSSzuY6')
// );
// const amount = 200000;
// transferCustomToken(tokenMintAddress, wallet, to, connection, amount)



// Transaction Code Test

// let connection = Connection(Devnet)
// let receiverWallet = CreateWallet()
// let payer = PubKeyFromSecretKey('5HGnVP4EQpkfSnzEz7jbjUa6ZVv2J7SBaW4XeUVNVKGV2MhNZvw71uq4sE6yvoFz5tQQCbTheUKz588L9dJtJuD6')
// let pub = WalletToPubKey(receiverWallet)
// console.log()
// console.log(payer)
// tx(connection,receiverWallet,payer)



// Testing LogEvent function

// const connection = new solanaweb3.Connection(solanaweb3.clusterApiUrl('devnet'))
// let pubkey = new PublicKey('3ZabwTMUhvpEWS6k3pw9Qo7zzacsutKGM2TCUiF2MBcn')
// logEvent(connection, pubkey);
