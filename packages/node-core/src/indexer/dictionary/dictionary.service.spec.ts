// Copyright 2020-2024 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0

import {EventEmitter2} from '@nestjs/event-emitter';
import {NETWORK_FAMILY} from '@subql/common';
import {NodeConfig} from '../..';
import {
  TestDictionaryV1,
  TestDictionaryV2,
  dsMap as mockedDsMap,
  TestFB,
  HAPPY_PATH_CONDITIONS,
} from './dictionary.fixtures';
import {DictionaryService} from './dictionary.service';

const dictionaryV1Endpoints = [
  'https://gx.api.subquery.network/sq/subquery/eth-dictionary',
  'https://dict-tyk.subquery.network/query/eth-mainnet',
];

const dictionaryV2Endpoints = ['http://mock-dictionary-v2/rpc'];

class TestDictionaryService extends DictionaryService<any, TestFB> {
  async initDictionaries(): Promise<void> {
    // Mock version inspection completed

    const dictionariesV1 = await Promise.all(
      dictionaryV1Endpoints.map(
        (endpoint) => new TestDictionaryV1(endpoint, 'mockChainId', this.nodeConfig, HAPPY_PATH_CONDITIONS)
      )
    );
    const mockDictionaryV2 = new TestDictionaryV2(dictionaryV2Endpoints[0], 'mockChainId', this.nodeConfig);
    await mockDictionaryV2.mockInit();

    const dictionariesV2 = [mockDictionaryV2];
    this.init([...dictionariesV1, ...dictionariesV2]);
  }

  get currentDictionaryIndex(): number | undefined {
    return this._currentDictionaryIndex;
  }

  set currentDictionaryIndex(index: number | undefined) {
    this._currentDictionaryIndex = index;
  }
}

describe('Dictionary service', function () {
  let dictionaryService: TestDictionaryService;

  beforeEach(async () => {
    const nodeConfig = new NodeConfig({
      subquery: 'dictionaryService',
      subqueryName: 'asdf',
      networkEndpoint: ['wss://eth.api.onfinality.io/public-ws'],
      dictionaryTimeout: 10,
      networkDictionary: [...dictionaryV1Endpoints, ...dictionaryV2Endpoints],
    });

    dictionaryService = new TestDictionaryService('0xchainId', nodeConfig, new EventEmitter2());
    await dictionaryService.initDictionaries();

    await Promise.all((dictionaryService as any)._dictionaries.map((d: any) => d.init()));
    dictionaryService.buildDictionaryEntryMap(mockedDsMap);
  });

  afterAll(() => dictionaryService.onApplicationShutdown());

  it('can use the dictionary registry to resolve a url', async () => {
    const dictUrl: string[] = await (dictionaryService as any).resolveDictionary(
      NETWORK_FAMILY.ethereum,
      1,
      'https://github.com/subquery/templates/raw/main/dist/dictionary.json'
    );

    expect(dictUrl.length).toBeGreaterThan(0);

    const dictUrl2: string[] = await (dictionaryService as any).resolveDictionary(
      NETWORK_FAMILY.substrate,
      '0x91b171bb158e2d3848fa23a9f1c25182fb8e20313b2c1eb49219da7a70ce90c3',
      'https://github.com/subquery/templates/raw/main/dist/dictionary.json'
    );

    expect(dictUrl2.length).toBeGreaterThan(0);
  });

  it('init Dictionaries with mutiple endpoints, can be valid and non-valid', () => {
    expect((dictionaryService as any)._dictionaries.length).toBe(3);
  });

  it('can find valid dictionary with height', () => {
    // If we haven't set dictionary
    expect(dictionaryService.currentDictionaryIndex).toBeUndefined();

    (dictionaryService as any).findDictionary(100, new Set<number>());
    expect(dictionaryService.currentDictionaryIndex).toBe(1);

    expect((dictionaryService as any).getDictionary(100)).toBeTruthy();
    // Current only valid endpoint been provided
    expect((dictionaryService as any).getDictionary(100).dictionaryEndpoint).toBe(
      'https://dict-tyk.subquery.network/query/eth-mainnet'
    );

    expect(dictionaryService.useDictionary(100)).toBeTruthy();
  });

  it('scopedDictionaryEntries, dictionary get data should be called', async () => {
    const dictionary = (dictionaryService as any).getDictionary(1000);

    const spyDictionary = jest.spyOn(dictionary, 'getData');

    await dictionaryService.scopedDictionaryEntries(1000, 11000, 100);
    expect(spyDictionary).toHaveBeenCalled();
  });

  it('scopedDictionaryEntries, if query failed/timeout, should try next valid dictionary for query', async () => {
    // mock current dictionary,  it is an invalid dictionary, should allow scopedDictionaryEntries to find next dictionary
    dictionaryService.currentDictionaryIndex = 0;
    const failedDictionary = (dictionaryService as any)._dictionaries[0];
    // mock this dictionary can pass validation
    failedDictionary._metadata = {lastProcessedHeight: 10000};
    // (dictionaryService as any)._dictionaries[0].heightValidation= (height:number) => true;
    const getDataError = jest.fn(() => {
      return Promise.reject(new Error('Dictionary index 0 mock fetch failed'));
    });
    failedDictionary.getData = getDataError;

    const passDictionary = (dictionaryService as any)._dictionaries[1];

    const spyPassGetData = jest.spyOn(passDictionary, 'getData');

    const spyScopedDictionaryEntries = jest.spyOn(dictionaryService as any, '_scopedDictionaryEntries');

    const res = await dictionaryService.scopedDictionaryEntries(1000, 11000, 100);
    expect(getDataError).toHaveBeenCalledTimes(1);
    expect(spyPassGetData).toHaveBeenCalledTimes(1);
    // failed 1 time + 1 retry
    expect(spyScopedDictionaryEntries).toHaveBeenCalledTimes(2);
    expect(dictionaryService.currentDictionaryIndex).toBe(1);
  });

  it('tried all dictionaries but all failed will return undefined', async () => {
    // remove the valid dictionary
    dictionaryService.currentDictionaryIndex = 0;
    // mock this dictionary can pass validation
    for (const dictionary of (dictionaryService as any)._dictionaries) {
      dictionary._metadata = {lastProcessedHeight: 10000};
      dictionary.getData = () => {
        throw new Error('Dictionary fetch failed');
      };
    }
    const spyScopedDictionaryEntries = jest.spyOn(dictionaryService as any, '_scopedDictionaryEntries');
    const blocks = await dictionaryService.scopedDictionaryEntries(1000, 11000, 100);
    expect(spyScopedDictionaryEntries).toHaveBeenCalledTimes(3);
    expect(blocks).toBeUndefined();
  }, 50000);
});
