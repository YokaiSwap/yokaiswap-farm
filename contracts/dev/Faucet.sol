// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./IERC20Mintable.sol";
import "./IMintableYokaiToken.sol";

contract Faucet {
    address public yokAddress;

    constructor(address _yokAddress) public {
        yokAddress = _yokAddress;
    }

    function mint(address[] calldata tokens, uint256 amount) public {
        uint256 length = tokens.length;
        for (uint256 i = 0; i < length; i++) {
            if (tokens[i] == yokAddress) {
                IMintableYokaiToken token = IMintableYokaiToken(tokens[i]);
                token.minterMint(msg.sender, amount);
            } else {
                IERC20Mintable token = IERC20Mintable(tokens[i]);
                token.mint(msg.sender, amount);
            }
        }
    }
}
