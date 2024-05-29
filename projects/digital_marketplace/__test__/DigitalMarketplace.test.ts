import { describe, test, expect, beforeAll, beforeEach } from '@jest/globals';
import { algorandFixture } from '@algorandfoundation/algokit-utils/testing';
import * as algokit from '@algorandfoundation/algokit-utils';
import { DigitalMarketplaceClient } from '../contracts/clients/DigitalMarketplaceClient';

const fixture = algorandFixture();
algokit.Config.configure({ populateAppCallResources: true });

let appClient: DigitalMarketplaceClient;

describe('DigitalMarketplace', () => {
  beforeEach(fixture.beforeEach);

  let seller: string;
  let testAssetId: bigint;

  beforeAll(async () => {
    await fixture.beforeEach();
    const { algorand } = fixture;
    const { testAccount } = fixture.context;
    seller = testAccount.addr;

    appClient = new DigitalMarketplaceClient(
      {
        sender: testAccount,
        resolveBy: 'id',
        id: 0,
      },
      algorand.client.algod
    );

    const assetCreate = await algorand.send.assetCreate({
      sender: seller,
      total: 10n,
    });

    testAssetId = BigInt(assetCreate.confirmation.assetIndex!);

    await appClient.create.createApplication({ assetId: testAssetId, unitaryPrice: 0n });
  });

  test('optInToAsset', async () => {
    const { algorand } = fixture;
    const { appAddress } = await appClient.appClient.getAppReference();

    const mbrTxn = await algorand.transactions.payment({
      sender: seller,
      receiver: appAddress,
      amount: algokit.algos(0.1 + 0.1),
      extraFee: algokit.algos(0.001),
    });

    const result = await appClient.optInToAsset({ mbrTxn });

    expect(result.confirmation).toBeDefined();

    const { balance }= await algorand .account.getAssetInformation(appAddress, testAssetId);
    expect(balance).toBe(0n);
  });

  test('deposit', async () => {
    const { algorand } = fixture;
    const { appAddress } = await appClient.appClient.getAppReference();

    const result = await algorand.send.assetTransfer({
      sender: seller,
      assetId: testAssetId,
      receiver: appAddress,
      amount: 3n,
    });

    expect(result.confirmation).toBeDefined();

    const { balance } = await algorand.account.getAssetInformation(appAddress, testAssetId);
    expect(balance).toBe(3n);
  });

  test('setPrice', async () => {
    await appClient.setPrice({ unitaryPrice: algokit.algos(3.3).microAlgos });

    const globalState = await appClient.getGlobalState();
    const unitaryPrice = globalState.unitaryPrice!.asBigInt();
    expect(unitaryPrice).toBe(BigInt(algokit.algos(3.3).microAlgos));
  });

  test('buy', async () => {
    const { testAccount: buyer } = fixture.context;
    const { algorand } = fixture;
    const { appAddress } = await appClient.appClient.getAppReference();

    await algorand.send.assetOptIn({
      sender: buyer.addr,
      assetId: testAssetId,
    });

    const buyerTxn = await algorand.transactions.payment({
      sender: buyer.addr,
      receiver: appAddress,
      amount: algokit.algos(6.6),
      extraFee: algokit.algos(0.001),
    });

    const result = await appClient.buy(
      {
      buyerTxn,
      quantity: 2n,
      }, {
      sender: buyer,
      }
  );

    expect(result.confirmation).toBeDefined();

    const { balance } = await algorand.account.getAssetInformation(buyer.addr, testAssetId);
    expect(balance).toBe(2n);
  });

  test('deleteApplication', async () => {
    const { algorand } = fixture;
    const { amount: beforeCallAmount } = await algorand.account.getInformation(seller);

    const result = await appClient.delete.deleteApplication({}, { sendParams: { fee: algokit.algos(0.003).microAlgos } });

    expect(result.confirmation).toBeDefined();

    const { amount: afterCallAmount } = await algorand.account.getInformation(seller);
    expect(afterCallAmount - beforeCallAmount).toEqual(algokit.algos(6.6 + 0.2 - 0.003));

    const { balance } = await algorand.account.getAssetInformation(seller, testAssetId);
    expect(balance).toBe(8n);
  });
});