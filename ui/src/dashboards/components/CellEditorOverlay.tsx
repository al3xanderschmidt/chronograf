// Libraries
import React, {Component} from 'react'
import _ from 'lodash'
import uuid from 'uuid'

// Components
import {ErrorHandling} from 'src/shared/decorators/errors'
import ResizeContainer from 'src/shared/components/ResizeContainer'
import QueryMaker from 'src/dashboards/components/QueryMaker'
import Visualization from 'src/dashboards/components/Visualization'
import OverlayControls from 'src/dashboards/components/OverlayControls'
import DisplayOptions from 'src/dashboards/components/DisplayOptions'
import CEOBottom from 'src/dashboards/components/CEOBottom'
import TimeMachine from 'src/flux/components/TimeMachine'
import KeyboardShortcuts from 'src/shared/components/KeyboardShortcuts'

// Actions
import {
  validateSuccess,
  fluxTimeSeriesError,
  fluxResponseTruncatedError,
} from 'src/shared/copy/notifications'

// APIs
import {getQueryConfigAndStatus} from 'src/shared/apis'
import {getSuggestions, getAST, getTimeSeries} from 'src/flux/apis'

// Utils
import {getDeep} from 'src/utils/wrappers'
import * as queryTransitions from 'src/utils/queryTransitions'
import defaultQueryConfig from 'src/utils/defaultQueryConfig'
import {buildQuery} from 'src/utils/influxql'
import {nextSource} from 'src/dashboards/utils/sources'
import replaceTemplate, {replaceInterval} from 'src/tempVars/utils/replace'
import {editCellQueryStatus} from 'src/dashboards/actions'
import {bodyNodes} from 'src/flux/helpers'
import {
  addNode,
  changeArg,
  parseError,
  appendJoin,
  appendFrom,
  deleteBody,
  toggleYield,
  deleteFuncNode,
  getBodyToScript,
  scriptUpToYield,
} from 'src/flux/helpers/scriptBuilder'

// Constants
import {IS_STATIC_LEGEND} from 'src/shared/constants'
import {TYPE_QUERY_CONFIG, CEOTabs} from 'src/dashboards/constants'
import {OVERLAY_TECHNOLOGY} from 'src/shared/constants/classNames'
import {MINIMUM_HEIGHTS, INITIAL_HEIGHTS} from 'src/data_explorer/constants'
import {
  AUTO_GROUP_BY,
  PREDEFINED_TEMP_VARS,
  TEMP_VAR_DASHBOARD_TIME,
  DEFAULT_DURATION_MS,
  DEFAULT_PIXELS,
} from 'src/shared/constants'
import {getCellTypeColors} from 'src/dashboards/constants/cellEditor'
import {builder, emptyAST} from 'src/flux/constants'

// Types
import * as ColorsModels from 'src/types/colors'
import * as DashboardsModels from 'src/types/dashboards'
import * as QueriesModels from 'src/types/queries'
import * as SourcesModels from 'src/types/sources'
import {Template} from 'src/types/tempVars'
import {Service, FluxTable} from 'src/types'
import {PublishNotificationActionCreator} from 'src/types/actions/notifications'

import {
  Suggestion,
  FlatBody,
  Links,
  InputArg,
  Context,
  DeleteFuncNodeArgs,
  ScriptStatus,
} from 'src/types/flux'

type QueryTransitions = typeof queryTransitions
type EditRawTextAsyncFunc = (
  url: string,
  id: string,
  text: string
) => Promise<void>
type CellEditorOverlayActionsFunc = (queryID: string, ...args: any[]) => void
type QueryActions = {
  [K in keyof QueryTransitions]: CellEditorOverlayActionsFunc
}
export type CellEditorOverlayActions = QueryActions & {
  editRawTextAsync: EditRawTextAsyncFunc
}

const staticLegend: DashboardsModels.Legend = {
  type: 'static',
  orientation: 'bottom',
}

interface QueryStatus {
  queryID: string
  status: QueriesModels.Status
}

interface Body extends FlatBody {
  id: string
}

interface Props {
  sources: SourcesModels.Source[]
  services: Service[]
  editQueryStatus: typeof editCellQueryStatus
  onCancel: () => void
  onSave: (cell: DashboardsModels.Cell) => void
  source: SourcesModels.Source
  dashboardID: number
  queryStatus: QueryStatus
  autoRefresh: number
  templates: Template[]
  timeRange: QueriesModels.TimeRange
  thresholdsListType: string
  thresholdsListColors: ColorsModels.ColorNumber[]
  gaugeColors: ColorsModels.ColorNumber[]
  lineColors: ColorsModels.ColorString[]
  cell: DashboardsModels.Cell

  // flux
  script: string
  links: Links
  notify: PublishNotificationActionCreator
  updateScript: (fluxScript: string) => void
}

interface State {
  queriesWorkingDraft: QueriesModels.QueryConfig[]
  activeQueryIndex: number
  activeEditorTab: CEOTabs
  isStaticLegend: boolean
  selectedSource: SourcesModels.Source
  selectedService: Service

  // flux
  ast: object
  body: Body[]
  data: FluxTable[]
  status: ScriptStatus
  suggestions: Suggestion[]
}

type ScriptFunc = (script: string) => void

const createWorkingDraft = (
  source: SourcesModels.Source,
  query: DashboardsModels.CellQuery
): QueriesModels.QueryConfig => {
  const {queryConfig} = query
  const draft: QueriesModels.QueryConfig = {
    ...queryConfig,
    id: uuid.v4(),
    source,
  }

  return draft
}

const createWorkingDrafts = (
  source: SourcesModels.Source,
  queries: DashboardsModels.CellQuery[]
): QueriesModels.QueryConfig[] =>
  _.cloneDeep(
    queries.map((query: DashboardsModels.CellQuery) =>
      createWorkingDraft(source, query)
    )
  )

export const FluxContext = React.createContext(undefined)

@ErrorHandling
class CellEditorOverlay extends Component<Props, State> {
  private overlayRef: HTMLDivElement
  private debouncedASTResponse: ScriptFunc

  constructor(props) {
    super(props)

    const {
      cell: {legend},
    } = props
    let {
      cell: {queries},
    } = props

    // Always have at least one query
    if (_.isEmpty(queries)) {
      queries = [{id: uuid.v4()}]
    }

    const queriesWorkingDraft = createWorkingDrafts(this.initialSource, queries)

    this.state = {
      queriesWorkingDraft,
      activeQueryIndex: 0,
      activeEditorTab: CEOTabs.Queries,
      isStaticLegend: IS_STATIC_LEGEND(legend),
      selectedService: null,
      selectedSource: null,

      // flux
      body: [],
      ast: null,
      data: [],
      suggestions: [],
      status: {
        type: 'none',
        text: '',
      },
    }

    this.debouncedASTResponse = _.debounce(script => {
      this.getASTResponse(script, false)
    }, 250)
  }

  public componentWillReceiveProps(nextProps: Props) {
    const {status, queryID} = this.props.queryStatus
    const {queriesWorkingDraft} = this.state
    const {queryStatus} = nextProps

    if (
      queryStatus.status &&
      queryStatus.queryID &&
      (queryStatus.queryID !== queryID || queryStatus.status !== status)
    ) {
      const nextQueries = queriesWorkingDraft.map(
        q => (q.id === queryID ? {...q, status: queryStatus.status} : q)
      )
      this.setState({queriesWorkingDraft: nextQueries})
    }
  }

  public async componentDidMount() {
    const {links} = this.props

    if (this.overlayRef) {
      this.overlayRef.focus()
    }

    try {
      const suggestions = await getSuggestions(links.suggestions)
      this.setState({suggestions})
    } catch (error) {
      console.error('Could not get function suggestions: ', error)
    }

    if (this.isFluxSource) {
      this.getTimeSeries()
    }
  }

  public render() {
    const {
      services,
      onCancel,
      templates,
      timeRange,
      autoRefresh,
      editQueryStatus,
    } = this.props

    const {activeEditorTab, queriesWorkingDraft, isStaticLegend} = this.state

    return (
      <div
        className={OVERLAY_TECHNOLOGY}
        onKeyDown={this.handleKeyDown}
        tabIndex={0}
        ref={this.onRef}
      >
        <ResizeContainer
          containerClass="resizer--full-size"
          minTopHeight={MINIMUM_HEIGHTS.visualization}
          minBottomHeight={MINIMUM_HEIGHTS.queryMaker}
          initialTopHeight={INITIAL_HEIGHTS.visualization}
          initialBottomHeight={INITIAL_HEIGHTS.queryMaker}
        >
          <Visualization
            source={this.source}
            timeRange={timeRange}
            templates={templates}
            autoRefresh={autoRefresh}
            queryConfigs={queriesWorkingDraft}
            editQueryStatus={editQueryStatus}
            staticLegend={isStaticLegend}
            isInCEO={true}
          />
          <CEOBottom>
            <OverlayControls
              onCancel={onCancel}
              queries={queriesWorkingDraft}
              source={this.source}
              sources={this.formattedSources}
              service={this.service}
              services={services}
              onSave={this.handleSaveCell}
              isSavable={this.isSaveable}
              activeEditorTab={activeEditorTab}
              onSetActiveEditorTab={this.handleSetActiveEditorTab}
              onChangeService={this.handleChangeService}
            />
            {this.cellEditorBottom}
          </CEOBottom>
        </ResizeContainer>
      </div>
    )
  }

  private get cellEditorBottom(): JSX.Element {
    const {activeEditorTab, queriesWorkingDraft, isStaticLegend} = this.state

    if (activeEditorTab === CEOTabs.Queries) {
      if (this.isFluxSource) {
        return this.fluxBuilder
      }
      return this.influxQLBuilder
    }

    return (
      <DisplayOptions
        queryConfigs={queriesWorkingDraft}
        onToggleStaticLegend={this.handleToggleStaticLegend}
        staticLegend={isStaticLegend}
        onResetFocus={this.handleResetFocus}
      />
    )
  }

  private get isFluxSource(): boolean {
    // TODO: Update once flux is no longer a separate service
    const {selectedService} = this.state

    if (selectedService) {
      return true
    }
    return false
  }

  private get fluxBuilder(): JSX.Element {
    const {suggestions, body, status} = this.state
    const {script, notify} = this.props

    return (
      <FluxContext.Provider value={this.getContext}>
        <KeyboardShortcuts onControlEnter={this.getTimeSeries}>
          <TimeMachine
            context={this.getContext}
            notify={notify}
            body={body}
            script={script}
            status={status}
            service={this.service}
            suggestions={suggestions}
            onValidate={this.handleValidate}
            onAppendFrom={this.handleAppendFrom}
            onAppendJoin={this.handleAppendJoin}
            onChangeScript={this.handleChangeScript}
            onSubmitScript={this.handleSubmitScript}
            onDeleteBody={this.handleDeleteBody}
          />
        </KeyboardShortcuts>
      </FluxContext.Provider>
    )
  }

  private get influxQLBuilder(): JSX.Element {
    const {templates, timeRange} = this.props

    const {activeQueryIndex, queriesWorkingDraft} = this.state
    return (
      <QueryMaker
        source={this.source}
        templates={templates}
        queries={queriesWorkingDraft}
        actions={this.queryActions}
        timeRange={timeRange}
        onDeleteQuery={this.handleDeleteQuery}
        onAddQuery={this.handleAddQuery}
        activeQueryIndex={activeQueryIndex}
        activeQuery={this.getActiveQuery()}
        setActiveQueryIndex={this.handleSetActiveQueryIndex}
        initialGroupByTime={AUTO_GROUP_BY}
      />
    )
  }

  private get formattedSources(): SourcesModels.SourceOption[] {
    const {sources} = this.props
    return sources.map(s => ({
      ...s,
      text: `${s.name} @ ${s.url}`,
    }))
  }

  private onRef = (r: HTMLDivElement) => {
    this.overlayRef = r
  }

  private queryStateReducer = (
    queryTransition
  ): CellEditorOverlayActionsFunc => (queryID: string, ...payload: any[]) => {
    const {queriesWorkingDraft} = this.state
    const queryWorkingDraft = queriesWorkingDraft.find(q => q.id === queryID)

    const nextQuery = queryTransition(queryWorkingDraft, ...payload)

    const nextQueries = queriesWorkingDraft.map(q => {
      if (q.id === queryWorkingDraft.id) {
        return {...nextQuery, source: nextSource(q, nextQuery)}
      }

      return q
    })

    this.setState({queriesWorkingDraft: nextQueries})
  }

  private handleChangeService = (
    selectedService: Service,
    selectedSource: SourcesModels.Source
  ) => {
    const queriesWorkingDraft: QueriesModels.QueryConfig[] = this.state.queriesWorkingDraft.map(
      q => ({
        ..._.cloneDeep(q),
        source: selectedSource,
      })
    )
    this.setState({selectedService, selectedSource, queriesWorkingDraft})
  }

  private handleAddQuery = () => {
    const {queriesWorkingDraft} = this.state
    const newIndex = queriesWorkingDraft.length

    this.setState({
      queriesWorkingDraft: [
        ...queriesWorkingDraft,
        {...defaultQueryConfig({id: uuid.v4()}), source: this.initialSource},
      ],
    })
    this.handleSetActiveQueryIndex(newIndex)
  }

  private handleDeleteQuery = index => {
    const {queriesWorkingDraft} = this.state
    const nextQueries = queriesWorkingDraft.filter((__, i) => i !== index)

    this.setState({queriesWorkingDraft: nextQueries})
  }

  private handleSaveCell = () => {
    const {queriesWorkingDraft, isStaticLegend} = this.state
    const {cell, thresholdsListColors, gaugeColors, lineColors} = this.props

    const queries: DashboardsModels.CellQuery[] = queriesWorkingDraft.map(q => {
      const timeRange = q.range || {
        upper: null,
        lower: TEMP_VAR_DASHBOARD_TIME,
      }
      const source = getDeep<string | null>(q.source, 'links.self', null)
      return {
        queryConfig: q,
        query: q.rawText || buildQuery(TYPE_QUERY_CONFIG, timeRange, q),
        source,
      }
    })

    const colors = getCellTypeColors({
      cellType: cell.type,
      gaugeColors,
      thresholdsListColors,
      lineColors,
    })

    const newCell: DashboardsModels.Cell = {
      ...cell,
      queries,
      colors,
      legend: isStaticLegend ? staticLegend : {},
    }

    this.props.onSave(newCell)
  }

  private handleSetActiveEditorTab = (tabName: CEOTabs): void => {
    this.setState({activeEditorTab: tabName})
  }

  private handleSetActiveQueryIndex = (activeQueryIndex): void => {
    this.setState({activeQueryIndex})
  }

  private handleToggleStaticLegend = isStaticLegend => (): void => {
    this.setState({isStaticLegend})
  }

  private getActiveQuery = () => {
    const {queriesWorkingDraft, activeQueryIndex} = this.state
    const activeQuery = _.get(
      queriesWorkingDraft,
      activeQueryIndex,
      queriesWorkingDraft[0]
    )

    const queryText = _.get(activeQuery, 'rawText', '')
    const userDefinedTempVarsInQuery = this.findUserDefinedTempVarsInQuery(
      queryText,
      this.props.templates
    )

    if (!!userDefinedTempVarsInQuery.length) {
      activeQuery.isQuerySupportedByExplorer = false
    }

    return activeQuery
  }

  private findUserDefinedTempVarsInQuery = (
    query: string,
    templates: Template[]
  ): Template[] => {
    return templates.filter((temp: Template) => {
      if (!query) {
        return false
      }
      const isPredefinedTempVar: boolean = !!PREDEFINED_TEMP_VARS.find(
        t => t === temp.tempVar
      )
      if (!isPredefinedTempVar) {
        return query.includes(temp.tempVar)
      }
      return false
    })
  }

  private getConfig = async (
    url,
    id: string,
    query: string,
    templates: Template[]
  ): Promise<QueriesModels.QueryConfig> => {
    // replace all templates but :interval:
    query = replaceTemplate(query, templates)
    let queries = []
    let durationMs = DEFAULT_DURATION_MS

    try {
      // get durationMs to calculate interval
      queries = await getQueryConfigAndStatus(url, [{query, id}])
      durationMs = _.get(queries, '0.durationMs', DEFAULT_DURATION_MS)

      // calc and replace :interval:
      query = replaceInterval(query, DEFAULT_PIXELS, durationMs)
    } catch (error) {
      console.error(error)
      throw error
    }

    try {
      // fetch queryConfig for with all template variables replaced
      queries = await getQueryConfigAndStatus(url, [{query, id}])
    } catch (error) {
      console.error(error)
      throw error
    }

    const {queryConfig} = queries.find(q => q.id === id)

    return queryConfig
  }

  // The schema explorer is not built to handle user defined template variables
  // in the query in a clear manner. If they are being used, we indicate that in
  // the query config in order to disable the fields column down stream because
  // at this point the query string is disconnected from the schema explorer.
  private handleEditRawText = async (
    url: string,
    id: string,
    text: string
  ): Promise<void> => {
    const {templates} = this.props
    const userDefinedTempVarsInQuery = this.findUserDefinedTempVarsInQuery(
      text,
      templates
    )

    const isUsingUserDefinedTempVars: boolean = !!userDefinedTempVarsInQuery.length

    try {
      const queryConfig = await this.getConfig(url, id, text, templates)
      const nextQueries = this.state.queriesWorkingDraft.map(q => {
        if (q.id === id) {
          const isQuerySupportedByExplorer = !isUsingUserDefinedTempVars

          if (isUsingUserDefinedTempVars) {
            return {
              ...q,
              rawText: text,
              status: {loading: true},
              isQuerySupportedByExplorer,
            }
          }

          // preserve query range and groupBy
          return {
            ...queryConfig,
            status: {loading: true},
            rawText: text,
            range: q.range,
            groupBy: q.groupBy,
            source: q.source,
            isQuerySupportedByExplorer,
          }
        }

        return q
      })

      this.setState({queriesWorkingDraft: nextQueries})
    } catch (error) {
      console.error(error)
    }
  }

  private get service() {
    const {selectedService} = this.state

    return selectedService
  }

  private handleKeyDown = e => {
    switch (e.key) {
      case 'Enter':
        if (!e.metaKey) {
          return
        } else if (e.target === this.overlayRef) {
          this.handleSaveCell()
        } else {
          e.target.blur()
          setTimeout(this.handleSaveCell, 50)
        }
        break
      case 'Escape':
        if (e.target === this.overlayRef) {
          this.props.onCancel()
        } else {
          const targetIsDropdown = e.target.classList[0] === 'dropdown'
          const targetIsButton = e.target.tagName === 'BUTTON'

          if (targetIsDropdown || targetIsButton) {
            return this.props.onCancel()
          }

          e.target.blur()
          this.overlayRef.focus()
        }
        break
    }
  }

  private handleResetFocus = () => {
    this.overlayRef.focus()
  }

  private get isSaveable(): boolean {
    const {queriesWorkingDraft} = this.state

    return queriesWorkingDraft.every(
      (query: QueriesModels.QueryConfig) =>
        (!!query.measurement && !!query.database && !!query.fields.length) ||
        !!query.rawText
    )
  }

  private get queryActions(): CellEditorOverlayActions {
    const mapped: QueryActions = _.mapValues<
      QueryActions,
      CellEditorOverlayActionsFunc
    >(queryTransitions, v => this.queryStateReducer(v)) as QueryActions

    const result: CellEditorOverlayActions = {
      ...mapped,
      editRawTextAsync: this.handleEditRawText,
    }

    return result
  }

  private get initialSource(): SourcesModels.Source {
    const {
      cell: {queries},
      source,
      sources,
    } = this.props

    const cellSourceLink: string = getDeep<string>(queries, '0.source', null)

    if (cellSourceLink) {
      const initialSource = sources.find(s => s.links.self === cellSourceLink)

      return initialSource
    }
    return source
  }

  private get source(): SourcesModels.Source {
    const {source, sources} = this.props
    const {selectedSource} = this.state

    if (selectedSource) {
      return selectedSource
    }

    const query = _.get(this.state.queriesWorkingDraft, 0, {source: null})

    if (!query.source) {
      return source
    }

    const foundSource = sources.find(
      s =>
        s.links.self ===
        getDeep<string | null>(query, 'source.links.self', null)
    )
    if (foundSource) {
      return foundSource
    }
    return source
  }

  // --------------- FLUX ----------------
  private get getContext(): Context {
    return {
      onAddNode: this.handleAddNode,
      onChangeArg: this.handleChangeArg,
      onSubmitScript: this.handleSubmitScript,
      onChangeScript: this.handleChangeScript,
      onDeleteFuncNode: this.handleDeleteFuncNode,
      onGenerateScript: this.handleGenerateScript,
      onToggleYield: this.handleToggleYield,
      service: this.service,
      data: this.state.data,
      scriptUpToYield: this.handleScriptUpToYield,
    }
  }

  private handleSubmitScript = () => {
    this.getASTResponse(this.props.script)
  }

  private handleGenerateScript = (): void => {
    this.getASTResponse(this.bodyToScript)
  }

  private handleChangeArg = (input: InputArg): void => {
    const body = changeArg(input, this.state.body)
    this.setState({body}, () => {
      if (input.generate) {
        this.handleGenerateScript()
      }
    })
  }

  private get bodyToScript(): string {
    return getBodyToScript(this.state.body)
  }

  private handleAppendFrom = (): void => {
    const {script} = this.props
    let newScript = script.trim()
    const from = builder.NEW_FROM
    if (!newScript) {
      this.getASTResponse(from)
      return
    }
    newScript = appendFrom(script)
    this.getASTResponse(newScript)
  }

  private handleAppendJoin = (): void => {
    const {script} = this.props
    const newScript = appendJoin(script)
    this.getASTResponse(newScript)
  }

  private handleChangeScript = (script: string): void => {
    this.debouncedASTResponse(script)
    this.props.updateScript(script)
  }

  private handleAddNode = (
    name: string,
    bodyID: string,
    declarationID: string
  ): void => {
    const script = addNode(name, bodyID, declarationID, this.state.body)
    this.getASTResponse(script)
  }

  private handleDeleteBody = (bodyID: string): void => {
    const script = deleteBody(bodyID, this.state.body)
    this.getASTResponse(script)
  }

  private handleScriptUpToYield = (
    bodyID: string,
    declarationID: string,
    funcNodeIndex: number,
    isYieldable: boolean
  ): string => {
    return scriptUpToYield(
      bodyID,
      declarationID,
      funcNodeIndex,
      isYieldable,
      this.state.body
    )
  }

  private handleToggleYield = (
    bodyID: string,
    declarationID: string,
    funcNodeIndex: number
  ): void => {
    const script = toggleYield(
      bodyID,
      declarationID,
      funcNodeIndex,
      this.state.body
    )
    this.getASTResponse(script)
  }

  private handleDeleteFuncNode = (ids: DeleteFuncNodeArgs): void => {
    const script = deleteFuncNode(ids, this.state.body)
    this.getASTResponse(script)
  }

  private handleValidate = async () => {
    const {links, notify, script} = this.props
    try {
      const ast = await getAST({url: links.ast, body: script})
      const body = bodyNodes(ast, this.state.suggestions)
      const status = {type: 'success', text: ''}
      notify(validateSuccess())
      this.setState({ast, body, status})
    } catch (error) {
      this.setState({status: parseError(error)})
      return console.error('Could not parse AST', error)
    }
  }

  private getASTResponse = async (script: string, update: boolean = true) => {
    const {links} = this.props
    if (!script) {
      this.props.updateScript(script)
      return this.setState({ast: emptyAST, body: []})
    }
    try {
      const ast = await getAST({url: links.ast, body: script})
      if (update) {
        this.props.updateScript(script)
      }
      const body = bodyNodes(ast, this.state.suggestions)
      const status = {type: 'success', text: ''}
      this.setState({ast, body, status})
    } catch (error) {
      this.setState({status: parseError(error)})
      return console.error('Could not parse AST', error)
    }
  }

  private getTimeSeries = async () => {
    const {script, links, notify} = this.props
    if (!script) {
      return
    }
    try {
      await getAST({url: links.ast, body: script})
    } catch (error) {
      this.setState({status: parseError(error)})
      return console.error('Could not parse AST', error)
    }
    try {
      const {tables, didTruncate} = await getTimeSeries(this.service, script)
      this.setState({data: tables})
      if (didTruncate) {
        notify(fluxResponseTruncatedError())
      }
    } catch (error) {
      this.setState({data: []})
      notify(fluxTimeSeriesError(error))
      console.error('Could not get timeSeries', error)
    }
    this.getASTResponse(script)
  }
}

export default CellEditorOverlay
