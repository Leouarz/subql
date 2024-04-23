// Copyright 2020-2024 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0

import {NETWORK_FAMILY} from '@subql/common';
import {DatasourceKind, TemplateKind} from '../codegen-controller';
import {ExampleProjectInterface} from '../init-controller';

export interface NetworkExampleProject {
  [key: string]: ExampleProjectInterface;
}

export interface ChainInfo {
  networkFamily: NETWORK_FAMILY;
  chainId: string;
}

export interface SubgraphTemplateSource {
  abi: string;
}

export interface SubgraphSource extends SubgraphTemplateSource {
  address: string;
  startBlock: number;
}

interface SubgraphDataSourceBase {
  kind: string;
  name: string;
  network: string;
  mapping: SubgraphMapping;
}

export interface SubgraphDataSource extends SubgraphDataSourceBase {
  source: SubgraphSource;
}

export interface SubgraphTemplate extends SubgraphDataSourceBase {
  source: SubgraphTemplateSource;
}

interface SubgraphMapping {
  kind: string;
  apiVersion: string;
  language: string;
  entities: string[];
  abis: {name: string; file: string}[];
  eventHandlers: {event: string; handler: string}[];
  callHandlers: {function: string; handler: string}[];
  blockHandlers: {filter?: {kind: string}; handler: string}[]; //TODO, subql support this filter
  file: string;
}

export interface SubgraphProject {
  name: string;
  author?: string;
  specVersion: string;
  description: string;
  repository: string;
  schema: {
    file: string;
  };
  dataSources: SubgraphDataSource[];
  templates?: SubgraphTemplate[];
}

export type MigrateMappingType<T extends DatasourceKind | TemplateKind = DatasourceKind> = {
  handlers: (T['mapping']['handlers'][number] & {migrateHandlerType: string})[];
};
export type MigrateDatasourceKind<T extends DatasourceKind | TemplateKind = DatasourceKind> = T & {
  migrateDatasourceType: string;
  mapping: T['mapping'] & MigrateMappingType;
};

// TODO, currently use DatasourceKind, which migrate network supported,should be a new type include all network dataSources
export type DsConvertFunction = (ds: SubgraphDataSource) => MigrateDatasourceKind;
export type TemplateConvertFunction = (ds: SubgraphTemplate) => MigrateDatasourceKind<TemplateKind>;
