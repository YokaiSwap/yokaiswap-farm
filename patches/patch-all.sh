#!/bin/bash

patch --forward node_modules/@pancakeswap/pancake-swap-lib/contracts/GSN/Context.sol patches/contracts/Context.sol.patch
rm node_modules/@pancakeswap/pancake-swap-lib/contracts/GSN/Context.sol.rej
patch --forward node_modules/@pancakeswap/pancake-swap-lib/contracts/access/Ownable.sol patches/contracts/Ownable.sol.patch
rm node_modules/@pancakeswap/pancake-swap-lib/contracts/access/Ownable.sol.rej
