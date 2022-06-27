const Wallet = require('ethereumjs-wallet').default;
const { expect, time, profileEVM, toBN } = require('@1inch/solidity-utils');
const { buildOrderRFQ, signOrderRFQ, compactSignature } = require('./helpers/orderUtils');
const { getPermit } = require('./helpers/eip712');
const { addr0Wallet, addr1Wallet } = require('./helpers/utils');

const TokenMock = artifacts.require('TokenMock');
const WrappedTokenMock = artifacts.require('WrappedTokenMock');
const LimitOrderProtocol = artifacts.require('LimitOrderProtocol');

describe('RFQ Orders in LimitOrderProtocol', async function () {
    const [addr0, addr1] = [addr0Wallet.getAddressString(), addr1Wallet.getAddressString()];

    before(async function () {
        this.chainId = await web3.eth.getChainId();
    });

    beforeEach(async function () {
        this.dai = await TokenMock.new('DAI', 'DAI');
        this.weth = await WrappedTokenMock.new('WETH', 'WETH');

        this.swap = await LimitOrderProtocol.new();

        await this.dai.mint(addr1, '1000000');
        await this.weth.mint(addr1, '1000000');
        await this.dai.mint(addr0, '1000000');
        await this.weth.mint(addr0, '1000000');

        await this.dai.approve(this.swap.address, '1000000');
        await this.weth.approve(this.swap.address, '1000000');
        await this.dai.approve(this.swap.address, '1000000', { from: addr1 });
        await this.weth.approve(this.swap.address, '1000000', { from: addr1 });
    });

    describe('wip', async function () {
        it('should swap fully based on RFQ signature', async function () {
            // Order: 1 DAI => 1 WETH
            // Swap:  1 DAI => 1 WETH

            for (const salt of ['000000000000000000000001', '000000000000000000000002']) {
                const order = buildOrderRFQ(salt, this.dai.address, this.weth.address, 1, 1, addr1);
                const signature = signOrderRFQ(order, this.chainId, this.swap.address, addr1Wallet.getPrivateKey());

                const makerDai = await this.dai.balanceOf(addr1);
                const takerDai = await this.dai.balanceOf(addr0);
                const makerWeth = await this.weth.balanceOf(addr1);
                const takerWeth = await this.weth.balanceOf(addr0);

                const receipt = await this.swap.fillOrderRFQ(order, signature, 1, 0);

                expect(
                    await profileEVM(receipt.tx, ['CALL', 'STATICCALL', 'SSTORE', 'SLOAD', 'EXTCODESIZE']),
                ).to.be.deep.equal([2, 1, 7, 7, 0]);

                // await gasspectEVM(receipt.tx);

                expect(await this.dai.balanceOf(addr1)).to.be.bignumber.equal(makerDai.subn(1));
                expect(await this.dai.balanceOf(addr0)).to.be.bignumber.equal(takerDai.addn(1));
                expect(await this.weth.balanceOf(addr1)).to.be.bignumber.equal(makerWeth.addn(1));
                expect(await this.weth.balanceOf(addr0)).to.be.bignumber.equal(takerWeth.subn(1));
            }
        });

        it('should swap fully based on RFQ signature (compact)', async function () {
            // Order: 1 DAI => 1 WETH
            // Swap:  1 DAI => 1 WETH

            for (const salt of ['000000000000000000000001', '000000000000000000000002']) {
                const order = buildOrderRFQ(salt, this.dai.address, this.weth.address, 1, 1, addr1);
                const signature = signOrderRFQ(order, this.chainId, this.swap.address, addr1Wallet.getPrivateKey());

                const makerDai = await this.dai.balanceOf(addr1);
                const takerDai = await this.dai.balanceOf(addr0);
                const makerWeth = await this.weth.balanceOf(addr1);
                const takerWeth = await this.weth.balanceOf(addr0);

                const { r, vs } = compactSignature(signature);
                const receipt = await this.swap.fillOrderRFQCompact(order, r, vs, 1);

                expect(
                    await profileEVM(receipt.tx, ['CALL', 'STATICCALL', 'SSTORE', 'SLOAD', 'EXTCODESIZE']),
                ).to.be.deep.equal([2, 1, 7, 7, 0]);

                // await gasspectEVM(receipt.tx);

                expect(await this.dai.balanceOf(addr1)).to.be.bignumber.equal(makerDai.subn(1));
                expect(await this.dai.balanceOf(addr0)).to.be.bignumber.equal(takerDai.addn(1));
                expect(await this.weth.balanceOf(addr1)).to.be.bignumber.equal(makerWeth.addn(1));
                expect(await this.weth.balanceOf(addr0)).to.be.bignumber.equal(takerWeth.subn(1));
            }
        });
    });

    describe('Permit', async function () {
        describe('fillOrderRFQToWithPermit', async function () {
            it('DAI => WETH', async function () {
                const swap = await LimitOrderProtocol.new();
                await this.dai.approve(swap.address, '1000000', { from: addr1 });
                const order = buildOrderRFQ('0xFF000000000000000000000001', this.dai.address, this.weth.address, 1, 1, addr1);
                const signature = signOrderRFQ(order, this.chainId, swap.address, addr1Wallet.getPrivateKey());

                const permit = await getPermit(addr0, addr0Wallet.getPrivateKey(), this.weth, '1', this.chainId, swap.address, '1');

                const makerDai = await this.dai.balanceOf(addr1);
                const takerDai = await this.dai.balanceOf(addr0);
                const makerWeth = await this.weth.balanceOf(addr1);
                const takerWeth = await this.weth.balanceOf(addr0);
                const allowance = await this.weth.allowance(addr1, swap.address);

                await swap.fillOrderRFQToWithPermit(order, signature, 1, 0, addr0, permit);

                expect(await this.dai.balanceOf(addr1)).to.be.bignumber.equal(makerDai.subn(1));
                expect(await this.dai.balanceOf(addr0)).to.be.bignumber.equal(takerDai.addn(1));
                expect(await this.weth.balanceOf(addr1)).to.be.bignumber.equal(makerWeth.addn(1));
                expect(await this.weth.balanceOf(addr0)).to.be.bignumber.equal(takerWeth.subn(1));
                expect(allowance).to.be.bignumber.eq(toBN('0'));
            });

            it('rejects reused signature', async function () {
                const swap = await LimitOrderProtocol.new();
                await this.dai.approve(swap.address, '1000000', { from: addr1 });
                const order = buildOrderRFQ('0xFF000000000000000000000001', this.dai.address, this.weth.address, 1, 1, addr1);
                const signature = signOrderRFQ(order, this.chainId, swap.address, addr1Wallet.getPrivateKey());

                const permit = await getPermit(addr0, addr0Wallet.getPrivateKey(), this.weth, '1', this.chainId, swap.address, '1');
                const requestFunc = () => swap.fillOrderRFQToWithPermit(order, signature, 0, 1, addr0, permit);
                await requestFunc();
                await expect(requestFunc()).to.eventually.be.rejectedWith('ERC20Permit: invalid signature');
            });

            it('rejects other signature', async function () {
                const swap = await LimitOrderProtocol.new();
                await this.dai.approve(swap.address, '1000000', { from: addr1 });
                const order = buildOrderRFQ('0xFF000000000000000000000001', this.dai.address, this.weth.address, 1, 1, addr1);
                const signature = signOrderRFQ(order, this.chainId, swap.address, addr1Wallet.getPrivateKey());

                const otherWallet = Wallet.generate();
                const permit = await getPermit(addr0, otherWallet.getPrivateKey(), this.weth, '1', this.chainId, swap.address, '1');
                const requestFunc = () => swap.fillOrderRFQToWithPermit(order, signature, 0, 1, addr0, permit);
                await expect(requestFunc()).to.eventually.be.rejectedWith('ERC20Permit: invalid signature');
            });

            it('rejects expired permit', async function () {
                const deadline = (await time.latest()) - time.duration.weeks(1);
                const swap = await LimitOrderProtocol.new();
                await this.dai.approve(swap.address, '1000000', { from: addr1 });
                const order = buildOrderRFQ('0xFF000000000000000000000001', this.dai.address, this.weth.address, 1, 1, addr1);
                const signature = signOrderRFQ(order, this.chainId, swap.address, addr1Wallet.getPrivateKey());

                const permit = await getPermit(addr0, addr1Wallet.getPrivateKey(), this.weth, '1', this.chainId, swap.address, '1', deadline);
                const requestFunc = () => swap.fillOrderRFQToWithPermit(order, signature, 0, 1, addr0, permit);
                await expect(requestFunc()).to.eventually.be.rejectedWith('expired deadline');
            });
        });
    });

    describe('OrderRFQ Cancelation', async function () {
        it('should cancel own order', async function () {
            await this.swap.cancelOrderRFQ('1');
            const invalidator = await this.swap.invalidatorForOrderRFQ(addr0, '0');
            expect(invalidator).to.be.bignumber.equal(toBN('2'));
        });

        it('should cancel own order with huge number', async function () {
            await this.swap.cancelOrderRFQ('1023');
            const invalidator = await this.swap.invalidatorForOrderRFQ(addr0, '3');
            expect(invalidator).to.be.bignumber.equal(toBN('1').shln(255));
        });

        it('should not fill cancelled order', async function () {
            const order = buildOrderRFQ('1', this.dai.address, this.weth.address, 1, 1, addr1);
            const signature = signOrderRFQ(order, this.chainId, this.swap.address, addr1Wallet.getPrivateKey());

            await this.swap.cancelOrderRFQ('1', { from: addr1 });

            await expect(
                this.swap.fillOrderRFQ(order, signature, 1, 0),
            ).to.eventually.be.rejectedWith('InvalidatedOrder()');
        });

        it('should not fill cancelled order (compact)', async function () {
            const order = buildOrderRFQ('1', this.dai.address, this.weth.address, 1, 1, addr1);
            const signature = signOrderRFQ(order, this.chainId, this.swap.address, addr1Wallet.getPrivateKey());

            await this.swap.cancelOrderRFQ('1', { from: addr1 });

            const { r, vs } = compactSignature(signature);
            await expect(
                this.swap.fillOrderRFQCompact(order, r, vs, 1),
            ).to.eventually.be.rejectedWith('InvalidatedOrder()');
        });
    });

    describe('Expiration', async function () {
        it('should fill RFQ order when not expired', async function () {
            const order = buildOrderRFQ('0xFF000000000000000000000001', this.dai.address, this.weth.address, 1, 1, addr1);
            const signature = signOrderRFQ(order, this.chainId, this.swap.address, addr1Wallet.getPrivateKey());

            const makerDai = await this.dai.balanceOf(addr1);
            const takerDai = await this.dai.balanceOf(addr0);
            const makerWeth = await this.weth.balanceOf(addr1);
            const takerWeth = await this.weth.balanceOf(addr0);

            await this.swap.fillOrderRFQ(order, signature, 1, 0);

            expect(await this.dai.balanceOf(addr1)).to.be.bignumber.equal(makerDai.subn(1));
            expect(await this.dai.balanceOf(addr0)).to.be.bignumber.equal(takerDai.addn(1));
            expect(await this.weth.balanceOf(addr1)).to.be.bignumber.equal(makerWeth.addn(1));
            expect(await this.weth.balanceOf(addr0)).to.be.bignumber.equal(takerWeth.subn(1));
        });

        it('should fill RFQ order when not expired (compact)', async function () {
            const order = buildOrderRFQ('0xFF000000000000000000000001', this.dai.address, this.weth.address, 1, 1, addr1);
            const signature = signOrderRFQ(order, this.chainId, this.swap.address, addr1Wallet.getPrivateKey());

            const makerDai = await this.dai.balanceOf(addr1);
            const takerDai = await this.dai.balanceOf(addr0);
            const makerWeth = await this.weth.balanceOf(addr1);
            const takerWeth = await this.weth.balanceOf(addr0);

            const { r, vs } = compactSignature(signature);
            await this.swap.fillOrderRFQCompact(order, r, vs, 1);

            expect(await this.dai.balanceOf(addr1)).to.be.bignumber.equal(makerDai.subn(1));
            expect(await this.dai.balanceOf(addr0)).to.be.bignumber.equal(takerDai.addn(1));
            expect(await this.weth.balanceOf(addr1)).to.be.bignumber.equal(makerWeth.addn(1));
            expect(await this.weth.balanceOf(addr0)).to.be.bignumber.equal(takerWeth.subn(1));
        });

        it('should partial fill RFQ order', async function () {
            const order = buildOrderRFQ('0xFF000000000000000000000001', this.dai.address, this.weth.address, 2, 2, addr1);
            const signature = signOrderRFQ(order, this.chainId, this.swap.address, addr1Wallet.getPrivateKey());

            const makerDai = await this.dai.balanceOf(addr1);
            const takerDai = await this.dai.balanceOf(addr0);
            const makerWeth = await this.weth.balanceOf(addr1);
            const takerWeth = await this.weth.balanceOf(addr0);

            await this.swap.fillOrderRFQ(order, signature, 1, 0);

            expect(await this.dai.balanceOf(addr1)).to.be.bignumber.equal(makerDai.subn(1));
            expect(await this.dai.balanceOf(addr0)).to.be.bignumber.equal(takerDai.addn(1));
            expect(await this.weth.balanceOf(addr1)).to.be.bignumber.equal(makerWeth.addn(1));
            expect(await this.weth.balanceOf(addr0)).to.be.bignumber.equal(takerWeth.subn(1));
        });

        it('should partial fill RFQ order (compact)', async function () {
            const order = buildOrderRFQ('0xFF000000000000000000000001', this.dai.address, this.weth.address, 2, 2, addr1);
            const signature = signOrderRFQ(order, this.chainId, this.swap.address, addr1Wallet.getPrivateKey());

            const makerDai = await this.dai.balanceOf(addr1);
            const takerDai = await this.dai.balanceOf(addr0);
            const makerWeth = await this.weth.balanceOf(addr1);
            const takerWeth = await this.weth.balanceOf(addr0);

            const { r, vs } = compactSignature(signature);
            await this.swap.fillOrderRFQCompact(order, r, vs, 1);

            expect(await this.dai.balanceOf(addr1)).to.be.bignumber.equal(makerDai.subn(1));
            expect(await this.dai.balanceOf(addr0)).to.be.bignumber.equal(takerDai.addn(1));
            expect(await this.weth.balanceOf(addr1)).to.be.bignumber.equal(makerWeth.addn(1));
            expect(await this.weth.balanceOf(addr0)).to.be.bignumber.equal(takerWeth.subn(1));
        });

        it('should fully fill RFQ order', async function () {
            const order = buildOrderRFQ('0xFF000000000000000000000001', this.dai.address, this.weth.address, 1, 1, addr1);
            const signature = signOrderRFQ(order, this.chainId, this.swap.address, addr1Wallet.getPrivateKey());

            const makerDai = await this.dai.balanceOf(addr1);
            const takerDai = await this.dai.balanceOf(addr0);
            const makerWeth = await this.weth.balanceOf(addr1);
            const takerWeth = await this.weth.balanceOf(addr0);

            await this.swap.fillOrderRFQ(order, signature, 0, 0);

            expect(await this.dai.balanceOf(addr1)).to.be.bignumber.equal(makerDai.subn(1));
            expect(await this.dai.balanceOf(addr0)).to.be.bignumber.equal(takerDai.addn(1));
            expect(await this.weth.balanceOf(addr1)).to.be.bignumber.equal(makerWeth.addn(1));
            expect(await this.weth.balanceOf(addr0)).to.be.bignumber.equal(takerWeth.subn(1));
        });

        it('should fully fill RFQ order wih (compact)', async function () {
            const order = buildOrderRFQ('0xFF000000000000000000000001', this.dai.address, this.weth.address, 1, 1, addr1);
            const signature = signOrderRFQ(order, this.chainId, this.swap.address, addr1Wallet.getPrivateKey());

            const makerDai = await this.dai.balanceOf(addr1);
            const takerDai = await this.dai.balanceOf(addr0);
            const makerWeth = await this.weth.balanceOf(addr1);
            const takerWeth = await this.weth.balanceOf(addr0);

            const { r, vs } = compactSignature(signature);
            await this.swap.fillOrderRFQCompact(order, r, vs, 0);

            expect(await this.dai.balanceOf(addr1)).to.be.bignumber.equal(makerDai.subn(1));
            expect(await this.dai.balanceOf(addr0)).to.be.bignumber.equal(takerDai.addn(1));
            expect(await this.weth.balanceOf(addr1)).to.be.bignumber.equal(makerWeth.addn(1));
            expect(await this.weth.balanceOf(addr0)).to.be.bignumber.equal(takerWeth.subn(1));
        });

        it('should not partial fill RFQ order when 0', async function () {
            const order = buildOrderRFQ('0xFF000000000000000000000001', this.dai.address, this.weth.address, 5, 10, addr1);
            const signature = signOrderRFQ(order, this.chainId, this.swap.address, addr1Wallet.getPrivateKey());

            await expect(
                this.swap.fillOrderRFQ(order, signature, 0, 1),
            ).to.eventually.be.rejectedWith('SwapWithZeroAmount()');
        });

        it('should not partial fill RFQ order when 0 (compact)', async function () {
            const order = buildOrderRFQ('0xFF000000000000000000000001', this.dai.address, this.weth.address, 5, 10, addr1);
            const signature = signOrderRFQ(order, this.chainId, this.swap.address, addr1Wallet.getPrivateKey());

            const { r, vs } = compactSignature(signature);
            await expect(
                this.swap.fillOrderRFQCompact(order, r, vs, 1),
            ).to.eventually.be.rejectedWith('RFQSwapWithZeroAmount()');
        });

        it('should not fill RFQ order when expired', async function () {
            const order = buildOrderRFQ('308276084001730439550074881', this.dai.address, this.weth.address, 1, 1, addr1);
            const signature = signOrderRFQ(order, this.chainId, this.swap.address, addr1Wallet.getPrivateKey());

            await expect(
                this.swap.fillOrderRFQ(order, signature, 1, 0),
            ).to.eventually.be.rejectedWith('OrderExpired()');
        });

        it('should not fill RFQ order when expired (compact)', async function () {
            const order = buildOrderRFQ('308276084001730439550074881', this.dai.address, this.weth.address, 1, 1, addr1);
            const signature = signOrderRFQ(order, this.chainId, this.swap.address, addr1Wallet.getPrivateKey());

            const { r, vs } = compactSignature(signature);
            await expect(
                this.swap.fillOrderRFQCompact(order, r, vs, 1),
            ).to.eventually.be.rejectedWith('OrderExpired()');
        });
    });
});
