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
  notifyCopyToClipboardSuccess,
} from 'src/shared/copy/notifications'
import {UpdateScript} from 'src/flux/actions'

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
// import {
//   addNode,
//   changeArg,
//   appendJoin,
//   appendFrom,
//   formatSource,
//   funcsToScript,
//   getBodyToScript,
//   formatLastSource,
// } from 'src/flux/helpers/scriptBuilder'

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
import {builder, emptyAST, argTypes} from 'src/flux/constants'

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
  Func,
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

interface Status {
  type: string
  text: string
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
  updateScript: UpdateScript
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
      notify,
    } = this.props
    notify(notifyCopyToClipboardSuccess('yo'))
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
    const {script} = this.props

    return (
      <FluxContext.Provider value={this.getContext}>
        <KeyboardShortcuts onControlEnter={this.getTimeSeries}>
          <TimeMachine
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
  private handleChangeArg = ({
    key,
    value,
    generate,
    funcID,
    declarationID = '',
    bodyID,
  }: InputArg): void => {
    const body = this.state.body.map(b => {
      if (b.id !== bodyID) {
        return b
      }
      if (declarationID) {
        const declarations = b.declarations.map(d => {
          if (d.id !== declarationID) {
            return d
          }
          const functions = this.editFuncArgs({
            funcs: d.funcs,
            funcID,
            key,
            value,
          })
          return {...d, funcs: functions}
        })
        return {...b, declarations}
      }
      const funcs = this.editFuncArgs({
        funcs: b.funcs,
        funcID,
        key,
        value,
      })
      return {...b, funcs}
    })
    this.setState({body}, () => {
      if (generate) {
        this.handleGenerateScript()
      }
    })
  }
  private editFuncArgs = ({funcs, funcID, key, value}): Func[] => {
    return funcs.map(f => {
      if (f.id !== funcID) {
        return f
      }
      const args = f.args.map(a => {
        if (a.key === key) {
          return {...a, value}
        }
        return a
      })
      return {...f, args}
    })
  }
  private get bodyToScript(): string {
    return this.getBodyToScript(this.state.body)
  }
  private getBodyToScript(body: Body[]): string {
    return body.reduce((acc, b) => {
      if (b.declarations.length) {
        const declaration = _.get(b, 'declarations.0', false)
        if (!declaration) {
          return acc
        }
        if (!declaration.funcs) {
          return `${acc}${b.source}`
        }
        return `${acc}${declaration.name} = ${this.funcsToScript(
          declaration.funcs
        )}\n\n`
      }
      return `${acc}${this.funcsToScript(b.funcs)}\n\n`
    }, '')
  }
  private funcsToScript(funcs): string {
    return funcs
      .map(func => `${func.name}(${this.argsToScript(func.args)})`)
      .join('\n\t|> ')
  }
  private argsToScript(args): string {
    const withValues = args.filter(arg => arg.value || arg.value === false)
    return withValues
      .map(({key, value, type}) => {
        if (type === argTypes.STRING) {
          return `${key}: "${value}"`
        }
        if (type === argTypes.ARRAY) {
          return `${key}: ["${value}"]`
        }
        if (type === argTypes.OBJECT) {
          const valueString = _.map(value, (v, k) => k + ':' + v).join(',')
          return `${key}: {${valueString}}`
        }
        return `${key}: ${value}`
      })
      .join(', ')
  }
  private handleAppendFrom = (): void => {
    const {script} = this.props
    let newScript = script.trim()
    const from = builder.NEW_FROM
    if (!newScript) {
      this.getASTResponse(from)
      return
    }
    newScript = `${script.trim()}\n\n${from}\n\n`
    this.getASTResponse(newScript)
  }
  private handleAppendJoin = (): void => {
    const {script} = this.props
    const newScript = `${script.trim()}\n\n${builder.NEW_JOIN}\n\n`
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
    const script = this.state.body.reduce((acc, body) => {
      const {id, source, funcs} = body
      if (id === bodyID) {
        const declaration = body.declarations.find(d => d.id === declarationID)
        if (declaration) {
          return `${acc}${declaration.name} = ${this.appendFunc(
            declaration.funcs,
            name
          )}`
        }
        return `${acc}${this.appendFunc(funcs, name)}`
      }
      return `${acc}${this.formatSource(source)}`
    }, '')
    this.getASTResponse(script)
  }
  private handleDeleteBody = (bodyID: string): void => {
    const newBody = this.state.body.filter(b => b.id !== bodyID)
    const script = this.getBodyToScript(newBody)
    this.getASTResponse(script)
  }
  private handleScriptUpToYield = (
    bodyID: string,
    declarationID: string,
    funcNodeIndex: number,
    isYieldable: boolean
  ): string => {
    const {body: bodies} = this.state
    const bodyIndex = bodies.findIndex(b => b.id === bodyID)
    const bodiesBeforeYield = bodies
      .slice(0, bodyIndex)
      .map(b => this.removeYieldFuncFromBody(b))
    const body = this.prepBodyForYield(
      bodies[bodyIndex],
      declarationID,
      funcNodeIndex
    )
    const bodiesForScript = [...bodiesBeforeYield, body]
    let script = this.getBodyToScript(bodiesForScript)
    if (!isYieldable) {
      const regex: RegExp = /\n{2}$/
      script = script.replace(regex, '\n\t|> last()\n\t|> yield()$&')
      return script
    }
    return script
  }
  private prepBodyForYield(
    body: Body,
    declarationID: string,
    yieldNodeIndex: number
  ) {
    const funcs = this.getFuncs(body, declarationID)
    const funcsUpToYield = funcs.slice(0, yieldNodeIndex)
    const yieldNode = funcs[yieldNodeIndex]
    const funcsWithoutYields = funcsUpToYield.filter(f => f.name !== 'yield')
    const funcsForBody = [...funcsWithoutYields, yieldNode]
    if (declarationID) {
      const declaration = body.declarations.find(d => d.id === declarationID)
      const declarations = [{...declaration, funcs: funcsForBody}]
      return {...body, declarations}
    }
    return {...body, funcs: funcsForBody}
  }
  private getFuncs(body: Body, declarationID: string): Func[] {
    const declaration = body.declarations.find(d => d.id === declarationID)
    if (declaration) {
      return _.get(declaration, 'funcs', [])
    }
    return _.get(body, 'funcs', [])
  }
  private removeYieldFuncFromBody(body: Body): Body {
    const declarationID = _.get(body, 'declarations.0.id')
    const funcs = this.getFuncs(body, declarationID)
    if (_.isEmpty(funcs)) {
      return body
    }
    const funcsWithoutYields = funcs.filter(f => f.name !== 'yield')
    if (declarationID) {
      const declaration = _.get(body, 'declarations.0')
      const declarations = [{...declaration, funcs: funcsWithoutYields}]
      return {...body, declarations}
    }
    return {...body, funcs: funcsWithoutYields}
  }
  private handleToggleYield = (
    bodyID: string,
    declarationID: string,
    funcNodeIndex: number
  ): void => {
    const script = this.state.body.reduce((acc, body) => {
      const {id, source, funcs} = body
      if (id === bodyID) {
        const declaration = body.declarations.find(d => d.id === declarationID)
        if (declaration) {
          return `${acc}${declaration.name} = ${this.addOrRemoveYieldFunc(
            declaration.funcs,
            funcNodeIndex
          )}`
        }
        return `${acc}${this.addOrRemoveYieldFunc(funcs, funcNodeIndex)}`
      }
      return `${acc}${this.formatSource(source)}`
    }, '')
    this.getASTResponse(script)
  }
  private getNextYieldName = (): string => {
    const yieldNamePrefix = 'results_'
    const yieldNamePattern = `${yieldNamePrefix}(\\d+)`
    const regex = new RegExp(yieldNamePattern)
    const MIN = -1
    const yieldsMaxResultNumber = this.state.body.reduce((scriptMax, body) => {
      const {funcs: bodyFuncs, declarations} = body
      let funcs = bodyFuncs
      if (!_.isEmpty(declarations)) {
        funcs = _.flatMap(declarations, d => _.get(d, 'funcs', []))
      }
      const yields = funcs.filter(f => f.name === 'yield')
      const bodyMax = yields.reduce((max, y) => {
        const yieldArg = _.get(y, 'args.0.value')
        if (!yieldArg) {
          return max
        }
        const yieldNumberString = _.get(yieldArg.match(regex), '1', `${MIN}`)
        const yieldNumber = parseInt(yieldNumberString, 10)
        return Math.max(yieldNumber, max)
      }, scriptMax)
      return Math.max(scriptMax, bodyMax)
    }, MIN)
    return `${yieldNamePrefix}${yieldsMaxResultNumber + 1}`
  }
  private addOrRemoveYieldFunc(funcs: Func[], funcNodeIndex: number): string {
    if (funcNodeIndex < funcs.length - 1) {
      const funcAfterNode = funcs[funcNodeIndex + 1]
      if (funcAfterNode.name === 'yield') {
        return this.removeYieldFunc(funcs, funcAfterNode)
      }
    }
    return this.insertYieldFunc(funcs, funcNodeIndex)
  }
  private removeYieldFunc(funcs: Func[], funcAfterNode: Func): string {
    const filteredFuncs = funcs.filter(f => f.id !== funcAfterNode.id)
    return `${this.funcsToScript(filteredFuncs)}\n\n`
  }
  private appendFunc = (funcs: Func[], name: string): string => {
    return `${this.funcsToScript(funcs)}\n\t|> ${name}()\n\n`
  }
  private insertYieldFunc(funcs: Func[], index: number): string {
    const funcsBefore = funcs.slice(0, index + 1)
    const funcsBeforeScript = this.funcsToScript(funcsBefore)
    const funcsAfter = funcs.slice(index + 1)
    const funcsAfterScript = this.funcsToScript(funcsAfter)
    const funcSeparator = '\n\t|> '
    if (funcsAfterScript) {
      return `${funcsBeforeScript}${funcSeparator}yield(name: "${this.getNextYieldName()}")${funcSeparator}${funcsAfterScript}\n\n`
    }
    return `${funcsBeforeScript}${funcSeparator}yield(name: "${this.getNextYieldName()}")\n\n`
  }
  private handleDeleteFuncNode = (ids: DeleteFuncNodeArgs): void => {
    const {funcID, declarationID = '', bodyID, yieldNodeID = ''} = ids
    const script = this.state.body
      .map((body, bodyIndex) => {
        if (body.id !== bodyID) {
          return this.formatSource(body.source)
        }
        const isLast = bodyIndex === this.state.body.length - 1
        if (declarationID) {
          const declaration = body.declarations.find(
            d => d.id === declarationID
          )
          if (!declaration) {
            return
          }
          const functions = declaration.funcs.filter(
            f => f.id !== funcID && f.id !== yieldNodeID
          )
          const s = this.funcsToSource(functions)
          return `${declaration.name} = ${this.formatLastSource(s, isLast)}`
        }
        const funcs = body.funcs.filter(
          f => f.id !== funcID && f.id !== yieldNodeID
        )
        const source = this.funcsToSource(funcs)
        return this.formatLastSource(source, isLast)
      })
      .join('')
    this.getASTResponse(script)
  }
  private formatSource = (source: string): string => {
    // currently a bug in the AST which does not add newlines to literal variable assignment bodies
    if (!source.match(/\n\n/)) {
      return `${source}\n\n`
    }
    return `${source}`
  }
  // formats the last line of a body string to include two new lines
  private formatLastSource = (source: string, isLast: boolean): string => {
    if (isLast) {
      return `${source}`
    }
    // currently a bug in the AST which does not add newlines to literal variable assignment bodies
    if (!source.match(/\n\n/)) {
      return `${source}\n\n`
    }
    return `${source}\n\n`
  }
  // funcsToSource takes a list of funtion nodes and returns an flux script
  private funcsToSource = (funcs): string => {
    return funcs.reduce((acc, f, i) => {
      if (i === 0) {
        return `${f.source}`
      }
      return `${acc}\n\t${f.source}`
    }, '')
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
      this.setState({status: this.parseError(error)})
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
      this.setState({status: this.parseError(error)})
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
      this.setState({status: this.parseError(error)})
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
  private parseError = (error): Status => {
    const s = error.data.slice(0, -5) // There is a 'null\n' at the end of these responses
    const data = JSON.parse(s)
    return {type: 'error', text: `${data.message}`}
  }
}

export default CellEditorOverlay
