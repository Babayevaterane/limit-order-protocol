// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

type RemainingInvalidator is uint256;

library RemainingInvalidatorLib {
    error RFQInvalidatedOrder();

    function isNewOrder(RemainingInvalidator invalidator) internal pure returns(bool) {
        return RemainingInvalidator.unwrap(invalidator) == 0;
    }

    function isPartialFilled(RemainingInvalidator invalidator) internal pure returns(bool) {
        return RemainingInvalidator.unwrap(invalidator) > 1;
    }

    function isFullyFilled(RemainingInvalidator invalidator) internal pure returns(bool) {
        return RemainingInvalidator.unwrap(invalidator) == 1;
    }

    function remaining(RemainingInvalidator invalidator) internal pure returns(uint256) {
        uint256 value = RemainingInvalidator.unwrap(invalidator);
        if (value == 0) {
            revert RFQInvalidatedOrder();
        }
        unchecked {
            return value - 1;
        }
    }

    function remaining(RemainingInvalidator invalidator, uint256 orderMakerAmount) internal pure returns(uint256) {
        uint256 value = RemainingInvalidator.unwrap(invalidator);
        if (value == 0) {
            return orderMakerAmount;
        }
        unchecked {
            return value - 1;
        }
    }

    function remains(uint256 remainingMakingAmount, uint256 makingAmount) internal pure returns(RemainingInvalidator) {
        unchecked {
            return RemainingInvalidator.wrap(remainingMakingAmount - makingAmount + 1);
        }
    }

    function fullyFilled() internal pure returns(RemainingInvalidator) {
        return RemainingInvalidator.wrap(1);
    }
}
