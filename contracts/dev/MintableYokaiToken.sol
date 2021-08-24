// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "../YokaiToken.sol";

contract MintableYokaiToken is YokaiToken {
    address public minter;

    function setMinter(address _minter) public onlyOwner {
        minter = _minter;
    }

    function minterMint(address to, uint256 amount) public {
        require(msg.sender == minter, "minter role is required");

        _mint(to, amount);
        _moveDelegates(address(0), _delegates[to], amount);
    }
}
