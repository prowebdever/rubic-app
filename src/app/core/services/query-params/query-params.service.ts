import { DOCUMENT } from '@angular/common';
import { Inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { List } from 'immutable';
import { BehaviorSubject, forkJoin, Observable, of } from 'rxjs';
import { BLOCKCHAIN_NAME } from '@shared/models/blockchain/blockchain-name';
import { first, map, mergeMap } from 'rxjs/operators';
import { TokensService } from 'src/app/core/services/tokens/tokens.service';
import { SwapFormService } from 'src/app/features/swaps/services/swaps-form-service/swap-form.service';
import { TokenAmount } from '@shared/models/tokens/token-amount';
import BigNumber from 'bignumber.js';
import { SwapsService } from 'src/app/features/swaps/services/swaps-service/swaps.service';
import { BridgeTokenPairsByBlockchains } from '@features/bridge/models/bridge-token-pairs-by-blockchains';
import { CrossChainRoutingService } from 'src/app/features/cross-chain-routing/services/cross-chain-routing-service/cross-chain-routing.service';
import { IframeService } from 'src/app/core/services/iframe/iframe.service';
import { ThemeService } from 'src/app/core/services/theme/theme.service';
import { TranslateService } from '@ngx-translate/core';
import { compareAddresses, switchIif } from 'src/app/shared/utils/utils';
import { PAGINATED_BLOCKCHAIN_NAME } from '@shared/models/tokens/paginated-tokens';
import { PublicBlockchainAdapterService } from '@core/services/blockchain/blockchain-adapters/public-blockchain-adapter.service';
import { AdditionalTokens, QueryParams } from './models/query-params';
import { GoogleTagManagerService } from 'src/app/core/services/google-tag-manager/google-tag-manager.service';

interface QuerySlippage {
  slippageIt: number | null;
  slippageCcr: number | null;
}

const DEFAULT_PARAMETERS = {
  swap: {
    fromChain: BLOCKCHAIN_NAME.ETHEREUM,
    toChain: BLOCKCHAIN_NAME.ETHEREUM,
    from: {
      [BLOCKCHAIN_NAME.ETHEREUM]: 'ETH',
      [BLOCKCHAIN_NAME.BINANCE_SMART_CHAIN]: 'BNB',
      [BLOCKCHAIN_NAME.POLYGON]: 'MATIC',
      [BLOCKCHAIN_NAME.HARMONY]: 'ONE',
      [BLOCKCHAIN_NAME.AVALANCHE]: 'AVAX',
      [BLOCKCHAIN_NAME.MOONRIVER]: 'MOVR'
    },
    to: {
      [BLOCKCHAIN_NAME.ETHEREUM]: 'RBC',
      [BLOCKCHAIN_NAME.BINANCE_SMART_CHAIN]: 'BRBC'
    },
    amount: '1'
  }
};

type DefaultParametersFrom = keyof typeof DEFAULT_PARAMETERS.swap.from;
type DefaultParametersTo = keyof typeof DEFAULT_PARAMETERS.swap.to;

@Injectable({
  providedIn: 'root'
})
export class QueryParamsService {
  public currentQueryParams: QueryParams;

  private readonly _tokensSelectionDisabled$ = new BehaviorSubject<[boolean, boolean]>([
    false,
    false
  ]);

  public get tokensSelectionDisabled$(): Observable<[boolean, boolean]> {
    return this._tokensSelectionDisabled$.asObservable();
  }

  private readonly _slippage$ = new BehaviorSubject<QuerySlippage>(null);

  public get slippage(): QuerySlippage {
    return this._slippage$.getValue();
  }

  public get noFrameLink(): string {
    const urlTree = this.router.parseUrl(this.router.url);
    delete urlTree.queryParams.iframe;
    return urlTree.toString();
  }

  constructor(
    private readonly tokensService: TokensService,
    private readonly publicBlockchainAdapterService: PublicBlockchainAdapterService,
    @Inject(DOCUMENT) private document: Document,
    private readonly router: Router,
    private readonly swapFormService: SwapFormService,
    private readonly swapsService: SwapsService,
    private readonly iframeService: IframeService,
    private readonly themeService: ThemeService,
    private readonly translateService: TranslateService,
    private readonly gtmService: GoogleTagManagerService
  ) {
    this.swapFormService.inputValueChanges.subscribe(value => {
      this.setQueryParams({
        ...(value.fromToken?.symbol && { from: value.fromToken.symbol }),
        ...(value.toToken?.symbol && { to: value.toToken.symbol }),
        ...(value.fromBlockchain && { fromChain: value.fromBlockchain }),
        ...(value.toBlockchain && { toChain: value.toBlockchain }),
        ...(value.fromAmount &&
          !value.fromAmount?.eq(0) &&
          value.fromAmount?.isFinite() && { amount: value.fromAmount.toFixed() })
      });
    });
  }

  public setupQueryParams(queryParams: QueryParams): void {
    if (queryParams && Object.keys(queryParams).length !== 0) {
      this.setIframeInfo(queryParams);
      this.setBackgroundStatus(queryParams);
      this.setHideSelectionStatus(queryParams);
      this.setSlippage(queryParams);
      this.setThemeStatus(queryParams);
      this.setAdditionalIframeTokens(queryParams);
      this.setLanguage(queryParams);

      const route = this.router.url.split('?')[0].substr(1);
      const hasParams = Object.keys(queryParams).length !== 0;
      if (hasParams && route === '') {
        this.initiateTradesParams(queryParams);
      }
    }
  }

  public setQueryParams(params: Partial<QueryParams>): void {
    this.currentQueryParams = {
      ...this.currentQueryParams,
      ...params
    };
    this.navigate();
  }

  private initiateTradesParams(params: QueryParams): void {
    this.swapsService.availableTokens$
      .pipe(
        first(tokens => tokens?.size > 0),
        mergeMap(tokens =>
          this.getProtectedSwapParams(params).pipe(
            map(protectedParams => ({ tokens, protectedParams }))
          )
        ),
        mergeMap(({ tokens, protectedParams }) => {
          const fromBlockchain = protectedParams.fromChain as BLOCKCHAIN_NAME;
          const toBlockchain = protectedParams.toChain as BLOCKCHAIN_NAME;

          const findFromToken$ = this.getTokenBySymbolOrAddress(
            tokens,
            protectedParams?.from,
            fromBlockchain
          );
          const findToToken$ = this.getTokenBySymbolOrAddress(
            tokens,
            protectedParams?.to,
            toBlockchain
          );

          return forkJoin([findFromToken$, findToToken$]).pipe(
            map(([fromToken, toToken]) => ({
              fromToken,
              toToken,
              fromBlockchain,
              toBlockchain,
              protectedParams
            }))
          );
        })
      )
      .subscribe(({ fromToken, toToken, fromBlockchain, toBlockchain, protectedParams }) => {
        this.gtmService.needTrackFormEventsNow = false;
        this.swapFormService.input.patchValue({
          fromBlockchain,
          toBlockchain,
          ...(fromToken && { fromToken }),
          ...(toToken && { toToken }),
          ...(protectedParams.amount !== undefined && {
            fromAmount: new BigNumber(protectedParams.amount)
          })
        });
      });
  }

  private getProtectedSwapParams(queryParams: QueryParams): Observable<QueryParams> {
    return this.swapsService.bridgeTokenPairsByBlockchainsArray$.pipe(
      first(pairsArray => !!pairsArray?.size),
      map(pairsArray => {
        const fromChain = Object.values(BLOCKCHAIN_NAME).includes(
          queryParams?.fromChain as BLOCKCHAIN_NAME
        )
          ? (queryParams.fromChain as BLOCKCHAIN_NAME)
          : DEFAULT_PARAMETERS.swap.fromChain;

        const toChain = Object.values(BLOCKCHAIN_NAME).includes(
          queryParams?.toChain as BLOCKCHAIN_NAME
        )
          ? (queryParams.toChain as BLOCKCHAIN_NAME)
          : DEFAULT_PARAMETERS.swap.toChain;

        const newParams = {
          ...queryParams,
          fromChain,
          toChain,
          ...(queryParams.from && { from: queryParams.from }),
          ...(queryParams.to && { to: queryParams.to }),
          ...(queryParams.amount && { amount: queryParams.amount })
        };

        if (fromChain === toChain && newParams.from && newParams.from === newParams.to) {
          if (newParams.from === DEFAULT_PARAMETERS.swap.from[fromChain as DefaultParametersFrom]) {
            newParams.from = DEFAULT_PARAMETERS.swap.to[fromChain as DefaultParametersTo];
          } else {
            newParams.to = DEFAULT_PARAMETERS.swap.from[fromChain as DefaultParametersFrom];
          }
        }

        if (
          fromChain !== toChain &&
          newParams.from &&
          newParams.to &&
          !(
            CrossChainRoutingService.isSupportedBlockchain(fromChain) &&
            CrossChainRoutingService.isSupportedBlockchain(toChain)
          ) &&
          !pairsArray.some(
            (pairsByBlockchains: BridgeTokenPairsByBlockchains) =>
              pairsByBlockchains.fromBlockchain === fromChain &&
              pairsByBlockchains.toBlockchain === toChain &&
              pairsByBlockchains.tokenPairs.some(
                tokenPair =>
                  tokenPair.tokenByBlockchain[fromChain]?.symbol.toLowerCase() ===
                    newParams.from?.toLowerCase() &&
                  tokenPair.tokenByBlockchain[toChain]?.symbol.toLowerCase() ===
                    newParams.to?.toLowerCase()
              )
          )
        ) {
          newParams.from = null;
          newParams.to = null;
        }
        return newParams;
      })
    );
  }

  /**
   * Gets tokens by symbol or address.
   * @param tokens Tokens list to search.
   * @param token Tokens symbol or address.
   * @param chain Tokens chain.
   * @return Observable<TokenAmount> Founded token.
   */
  private getTokenBySymbolOrAddress(
    tokens: List<TokenAmount>,
    token: string,
    chain: BLOCKCHAIN_NAME
  ): Observable<TokenAmount> {
    if (!token) {
      return of(null);
    }
    const blockchainAdapter = this.publicBlockchainAdapterService[chain];

    return blockchainAdapter.isAddressCorrect(token)
      ? this.searchTokenByAddress(tokens, token, chain)
      : this.searchTokenBySymbol(tokens, token, chain);
  }

  /**
   * Searches token by symbol.
   * @param tokens List of local tokens.
   * @param symbol Symbol to search.
   * @param chain Chain to search.
   * @return Observable<TokenAmount> Searched token.
   */
  private searchTokenBySymbol(
    tokens: List<TokenAmount>,
    symbol: string,
    chain: string
  ): Observable<TokenAmount> {
    const similarTokens = tokens.filter(
      token => token.symbol === symbol && token.blockchain === chain
    );

    if (!similarTokens.size) {
      return this.tokensService.fetchQueryTokens(symbol, chain as PAGINATED_BLOCKCHAIN_NAME).pipe(
        map(foundedTokens => {
          if (foundedTokens?.size) {
            const token =
              foundedTokens?.size > 1
                ? foundedTokens.find(el => el.symbol === symbol)
                : foundedTokens.first();
            return { ...token, amount: new BigNumber(NaN) } as TokenAmount;
          }
          return null;
        })
      );
    }

    return of(similarTokens.first());
  }

  /**
   * Searches token by address.
   * @param tokens List of local tokens.
   * @param address Address to search.
   * @param chain Chain to search.
   * @return Observable<TokenAmount> Searched token.
   */
  private searchTokenByAddress(
    tokens: List<TokenAmount>,
    address: string,
    chain: BLOCKCHAIN_NAME
  ): Observable<TokenAmount> {
    const searchingToken = tokens.find(
      token => compareAddresses(token.address, address) && token.blockchain === chain
    );

    return searchingToken
      ? of(searchingToken)
      : this.tokensService.fetchQueryTokens(address, chain as PAGINATED_BLOCKCHAIN_NAME).pipe(
          switchIif(
            backendTokens => Boolean(backendTokens?.size),
            () => of(tokens.first()),
            () => this.tokensService.addTokenByAddress(address, chain).pipe(first())
          ),
          map(fetchedToken => {
            return { ...fetchedToken, amount: new BigNumber(NaN) } as TokenAmount;
          })
        );
  }

  private navigate(): void {
    this.router.navigate([], {
      queryParams: this.currentQueryParams,
      queryParamsHandling: 'merge'
    });
  }

  private setIframeInfo(queryParams: QueryParams): void {
    if (!queryParams.hasOwnProperty('iframe')) {
      return;
    }

    this.iframeService.setIframeStatus(queryParams.iframe);
    this.iframeService.setIframeDevice(queryParams.device);
  }

  private setBackgroundStatus(queryParams: QueryParams): void {
    if (this.iframeService.isIframe) {
      const { background } = queryParams;
      if (this.isBackgroundValid(background)) {
        this.document.body.style.background = background;
        return;
      }
      this.document.body.classList.add('default-iframe-background');
    }
  }

  private setHideSelectionStatus(queryParams: QueryParams): void {
    if (!this.iframeService.isIframe) {
      return;
    }

    const tokensSelectionDisabled: [boolean, boolean] = [
      queryParams.hideSelectionFrom === 'true',
      queryParams.hideSelectionTo === 'true'
    ];

    if (tokensSelectionDisabled.includes(true)) {
      this._tokensSelectionDisabled$.next(tokensSelectionDisabled);
    }
  }

  private setSlippage(queryParams: QueryParams): void {
    if (!this.iframeService.isIframe) {
      return;
    }

    this._slippage$.next({
      slippageIt: queryParams.slippageIt ? parseFloat(queryParams.slippageIt) : null,
      slippageCcr: queryParams.slippageCcr ? parseFloat(queryParams.slippageCcr) : null
    });
  }

  private setThemeStatus(queryParams: QueryParams): void {
    const { theme } = queryParams;
    if (theme && (theme === 'dark' || theme === 'light')) {
      this.themeService.setTheme(theme);
    }
  }

  private setAdditionalIframeTokens(queryParams: QueryParams): void {
    if (!this.iframeService.isIframe) {
      return;
    }

    const tokensFilterKeys: Readonly<Array<keyof QueryParams>> = [
      'eth_tokens',
      'bsc_tokens',
      'polygon_tokens',
      'harmony_tokens',
      'avalanche_tokens',
      'fantom_tokens',
      'moonriver_tokens'
    ] as const;
    const tokensQueryParams = Object.fromEntries(
      Object.entries(queryParams).filter(([key]) =>
        tokensFilterKeys.includes(key as AdditionalTokens)
      )
    );

    if (Object.keys(tokensQueryParams).length !== 0) {
      this.tokensService.tokensRequestParameters = tokensQueryParams;
    }
  }

  private setLanguage(queryParams: QueryParams): void {
    if (!this.iframeService.isIframe) {
      return;
    }

    const supportedLanguages = ['en', 'es', 'ko', 'ru', 'zh'];
    const language = supportedLanguages.includes(queryParams.language)
      ? queryParams.language
      : 'en';
    this.translateService.use(language);
  }

  private isBackgroundValid(stringToTest: string): boolean {
    if (stringToTest === '') {
      return false;
    }
    if (stringToTest === 'inherit') {
      return false;
    }
    if (stringToTest === 'transparent') {
      return false;
    }

    const image = document.createElement('img');
    image.style.background = 'rgb(0, 0, 0)';
    image.style.background = stringToTest;
    if (image.style.background !== 'rgb(0, 0, 0)') {
      return true;
    }
    image.style.background = 'rgb(255, 255, 255)';
    image.style.background = stringToTest;
    return image.style.background !== 'rgb(255, 255, 255)';
  }
}
