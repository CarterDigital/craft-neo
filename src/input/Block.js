import $ from 'jquery'
import '../jquery-extensions'

import Garnish from 'garnish'
import Craft from 'craft'

import NS from '../namespace'

import ReasonsRenderer from '../plugins/reasons/Renderer'

import renderTemplate from './templates/block.twig'
import '../twig-extensions'

const _defaults = {
	namespace: [],
	blockType: null,
	id: null,
	level: 0,
	buttons: null,
	enabled: true,
	collapsed: false,
	modified: true
}

const _resources = {}

function _resourceFilter()
{
	let url = this.href || this.src

	if(url)
	{
		const paramIndex = url.indexOf('?')

		url = (paramIndex < 0 ? url : url.substr(0, paramIndex))

		const isNew = !_resources.hasOwnProperty(url)
		_resources[url] = 1

		return isNew
	}

	return true
}

export default Garnish.Base.extend({

	_templateNs: [],
	_blockType: null,
	_initialised: false,
	_expanded: true,
	_enabled: true,
	_modified: true,
	_initialState: null,

	init(settings = {})
	{
		settings = Object.assign({}, _defaults, settings)

		this._templateNs = NS.parse(settings.namespace)
		this._blockType = settings.blockType
		this._id = settings.id
		this._buttons = settings.buttons
		this._modified = settings.modified

		NS.enter(this._templateNs)

		this.$container = $(renderTemplate({
			type: this._blockType,
			id: this._id,
			enabled: !!settings.enabled,
			collapsed: !!settings.collapsed,
			level: settings.level,
			modified: settings.modified
		}))

		NS.leave()

		const $neo = this.$container.find('[data-neo-b]')
		this.$topbarContainer = $neo.filter('[data-neo-b="container.topbar"]')
		this.$bodyContainer = $neo.filter('[data-neo-b="container.body"]')
		this.$contentContainer = $neo.filter('[data-neo-b="container.content"]')
		this.$childrenContainer = $neo.filter('[data-neo-b="container.children"]')
		this.$blocksContainer = $neo.filter('[data-neo-b="container.blocks"]')
		this.$buttonsContainer = $neo.filter('[data-neo-b="container.buttons"]')
		this.$tabsContainer = $neo.filter('[data-neo-b="container.tabs"]')
		this.$tabContainer = $neo.filter('[data-neo-b="container.tab"]')
		this.$menuContainer = $neo.filter('[data-neo-b="container.menu"]')
		this.$tabButton = $neo.filter('[data-neo-b="button.tab"]')
		this.$settingsButton = $neo.filter('[data-neo-b="button.actions"]')
		this.$togglerButton = $neo.filter('[data-neo-b="button.toggler"]')
		this.$tabsButton = $neo.filter('[data-neo-b="button.tabs"]')
		this.$enabledInput = $neo.filter('[data-neo-b="input.enabled"]')
		this.$collapsedInput = $neo.filter('[data-neo-b="input.collapsed"]')
		this.$levelInput = $neo.filter('[data-neo-b="input.level"]')
		this.$modifiedInput = $neo.filter('[data-neo-b="input.modified"]')
		this.$status = $neo.filter('[data-neo-b="status"]')

		if(this._buttons)
		{
			this._buttons.on('newBlock', e => this.trigger('newBlock', Object.assign(e, {level: this.getLevel() + 1})))
			this.$buttonsContainer.append(this._buttons.$container)
		}

		let hasErrors = false
		if(this._blockType)
		{
			for(let tab of this._blockType.getTabs())
			{
				if(tab.getErrors().length > 0)
				{
					hasErrors = true
					break
				}
			}
		}

		this.setLevel(settings.level)
		this.toggleEnabled(settings.enabled)
		this.toggleExpansion(hasErrors ? true : !settings.collapsed, false, false)

		this.addListener(this.$togglerButton, 'dblclick', '@doubleClickTitle')
		this.addListener(this.$tabButton, 'click', '@setTab')
	},

	initUi()
	{
		if(!this._initialised)
		{
			const tabs = this._blockType.getTabs()

			let headList = tabs.map(tab => tab.getHeadHtml(this._id))
			let footList = tabs.map(tab => tab.getFootHtml(this._id))
			this.$head = $(headList.join('')).filter(_resourceFilter)
			this.$foot = $(footList.join('')).filter(_resourceFilter)

			Garnish.$bod.siblings('head').append(this.$head)
			Garnish.$bod.append(this.$foot)
			Craft.initUiElements(this.$contentContainer)
			this.$tabsButton.menubtn()

			this._settingsMenu = new Garnish.MenuBtn(this.$settingsButton);
			this._settingsMenu.on('optionSelect', e => this['@settingSelect'](e))

			this._initialised = true

			if(this._buttons)
			{
				this._buttons.initUi()
			}

			this.addListener(this.$container, 'resize', () => this.updateResponsiveness())
			Garnish.requestAnimationFrame(() => this.updateResponsiveness())

			this._initReasonsPlugin()
			this._initRelabelPlugin()

			if(!this.isNew() && !this._modified)
			{
				this._initialState = {
					enabled: this._enabled,
					level: this._level,
					content: Garnish.getPostData(this.$contentContainer)
				}

				this._detectChangeInterval = setInterval(() => this._detectChange(), 300)
			}

			this.trigger('initUi')
		}
	},

	destroy()
	{
		if(this._initialised)
		{
			this.$head.remove()
			this.$foot.remove()

			clearInterval(this._detectChangeInterval)

			this._destroyReasonsPlugin()

			this.trigger('destroy')
		}
	},

	getBlockType()
	{
		return this._blockType
	},

	getId()
	{
		return this._id
	},

	getLevel()
	{
		return this._level
	},

	setLevel(level)
	{
		this._level = level|0

		this.$levelInput.val(this._level)
		this.$container.toggleClass('is-level-odd', !!(this._level % 2))
		this.$container.toggleClass('is-level-even', !(this._level % 2))
	},

	getButtons()
	{
		return this._buttons
	},

	getContent()
	{
		const rawContent = Garnish.getPostData(this.$contentContainer)
		const content = {}

		const setValue = (keys, value) =>
		{
			let currentSet = content

			for(let i = 0; i < keys.length - 1; i++)
			{
				let key = keys[i]

				if(!$.isPlainObject(currentSet[key]) && !$.isArray(currentSet[key]))
				{
					currentSet[key] = {}
				}

				currentSet = currentSet[key]
			}

			let key = keys[keys.length - 1]
			currentSet[key] = value
		}

		for(let rawName of Object.keys(rawContent))
		{
			let fullName = NS.parse(rawName)
			let name = fullName.slice(this._templateNs.length + 1) // Adding 1 because content is NS'd under [fields]
			let value = rawContent[rawName]

			setValue(name, value)
		}

		return content
	},

	isNew()
	{
		return /^new/.test(this.getId())
	},

	isSelected()
	{
		return this.$container.hasClass('is-selected')
	},

	collapse(save, animate)
	{
		this.toggleExpansion(false, save, animate)
	},

	expand(save, animate)
	{
		this.toggleExpansion(true, save, animate)
	},

	toggleExpansion(expand, save, animate)
	{
		expand  = (typeof expand  === 'boolean' ? expand  : !this._expanded)
		save    = (typeof save    === 'boolean' ? save    : true)
		animate = (typeof animate === 'boolean' ? animate : true)

		if(expand !== this._expanded)
		{
			this._expanded = expand

			const expandContainer = this.$menuContainer.find('[data-action="expand"]').parent()
			const collapseContainer = this.$menuContainer.find('[data-action="collapse"]').parent()

			this.$container
				.toggleClass('is-expanded', this._expanded)
				.toggleClass('is-contracted', !this._expanded)

			expandContainer.toggleClass('hidden', this._expanded)
			collapseContainer.toggleClass('hidden', !this._expanded)

			const expandedCss = {
				opacity: 1,
				height: this.$contentContainer.outerHeight() + this.$childrenContainer.outerHeight()
			}
			const collapsedCss = {
				opacity: 0,
				height: 0
			}
			const clearCss = {
				opacity: '',
				height: ''
			}

			if(animate)
			{
				this.$bodyContainer
					.css(this._expanded ? collapsedCss : expandedCss)
					.velocity(this._expanded ? expandedCss : collapsedCss, 'fast', e =>
					{
						if(this._expanded)
						{
							this.$bodyContainer.css(clearCss)
						}
					})
			}
			else
			{
				this.$bodyContainer.css(this._expanded ? clearCss : collapsedCss)
			}

			this.$collapsedInput.val(this._expanded ? 0 : 1)

			if(save)
			{
				this.saveExpansion()
			}

			this.trigger('toggleExpansion', {
				expanded: this._expanded
			})
		}
	},

	isExpanded()
	{
		return this._expanded
	},

	saveExpansion()
	{
		if(!this.isNew())
		{
			Craft.queueActionRequest('neo/saveExpansion', {
				expanded: this.isExpanded(),
				blockId: this.getId()
			})
		}
	},

	disable()
	{
		this.toggleEnabled(false)
	},

	enable()
	{
		this.toggleEnabled(true)
	},

	toggleEnabled(enable = !this._enabled)
	{
		if(enable !== this._enabled)
		{
			this._enabled = enable

			const enableContainer = this.$menuContainer.find('[data-action="enable"]').parent()
			const disableContainer = this.$menuContainer.find('[data-action="disable"]').parent()

			this.$container
				.toggleClass('is-enabled', this._enabled)
				.toggleClass('is-disabled', !this._enabled)

			this.$status.toggleClass('hidden', this._enabled)

			enableContainer.toggleClass('hidden', this._enabled)
			disableContainer.toggleClass('hidden', !this._enabled)

			this.$enabledInput.val(this._enabled ? 1 : 0)

			this.trigger('toggleEnabled', {
				enabled: this._enabled
			})
		}
	},

	isEnabled()
	{
		return this._enabled
	},

	selectTab(name)
	{
		const $tabs = $()
			.add(this.$tabButton)
			.add(this.$tabContainer)

		$tabs.removeClass('is-selected')

		const $tab = $tabs.filter(`[data-neo-b-info="${name}"]`).addClass('is-selected')

		this.$tabsButton.text(name)

		this.trigger('selectTab', {
			tabName: name,
			$tabButton: $tab.filter('[data-neo-b="button.tab"]'),
			$tabContainer: $tab.filter('[data-neo-b="container.tab"]')
		})
	},

	updateResponsiveness()
	{
		if(!this._tabsContainerWidth)
		{
			this._tabsContainerWidth = this.$tabsContainer.width()
		}

		const isMobile = (this.$tabsContainer.parent().width() < this._tabsContainerWidth)

		this.$tabsContainer.toggleClass('hidden', isMobile)
		this.$tabsButton.toggleClass('hidden', !isMobile)
	},

	updateMenuStates(blocks = [], maxBlocks = 0)
	{
		const blockType = this.getBlockType()
		const blocksOfType = blocks.filter(b => b.getBlockType().getHandle() === blockType.getHandle())
		const maxBlockTypes = blockType.getMaxBlocks()

		const allDisabled = (maxBlocks > 0 && blocks.length >= maxBlocks)
		const typeDisabled = (maxBlockTypes > 0 && blocksOfType.length >= maxBlockTypes)

		const disabled = allDisabled || typeDisabled

		this.$menuContainer.find('[data-action="duplicate"]').toggleClass('disabled', disabled)
	},

	_initReasonsPlugin()
	{
		const Reasons = Craft.ReasonsPlugin

		if(Reasons)
		{
			const Renderer = ReasonsRenderer(Reasons.ConditionalsRenderer)

			const type = this.getBlockType()
			const typeId = type.getId()
			const conditionals = Reasons.Neo.conditionals[typeId] || {}

			this._reasons = new Renderer(this.$contentContainer, conditionals)
		}
	},

	_destroyReasonsPlugin()
	{
		if(this._reasons)
		{
			this._reasons.destroy()
		}
	},

	_initRelabelPlugin()
	{
		const Relabel = window.Relabel

		if(Relabel)
		{
			NS.enter(this._templateNs)

			const blockType = this.getBlockType()
			Relabel.applyLabels(this.$contentContainer, blockType.getFieldLayoutId(), NS.value())

			NS.leave()
		}
	},

	_detectChange()
	{
		const initial = this._initialState
		const content = Garnish.getPostData(this.$contentContainer)

		const modified = !Craft.compare(content, initial.content) ||
			initial.enabled !== this._enabled ||
			initial.level !== this._level

		if(modified !== this._modified)
		{
			this.$modifiedInput.val(modified ? 1 : 0)
			this._modified = modified
		}
	},

	'@settingSelect'(e)
	{
		const $option = $(e.option)

		if(!$option.hasClass('disabled'))
		{
			switch($option.attr('data-action'))
			{
				case 'collapse': this.collapse() ; break
				case 'expand':   this.expand()   ; break
				case 'disable':  this.disable()
								 this.collapse() ; break
				case 'enable':   this.enable()
								 this.expand()   ; break
				case 'delete':   this.destroy()  ; break

				case 'add':
					this.trigger('addBlockAbove', {
						block: this
					})
					break

				case 'duplicate':
					this.trigger('duplicateBlock', {
						block: this
					})
					break
			}
		}
	},

	'@doubleClickTitle'(e)
	{
		e.preventDefault()

		this.toggleExpansion()
	},

	'@setTab'(e)
	{
		e.preventDefault()

		const $tab = $(e.currentTarget)
		const tabName = $tab.attr('data-neo-b-info')

		this.selectTab(tabName)
	}
},
{
	_totalNewBlocks: 0,

	getNewId()
	{
		return `new${this._totalNewBlocks++}`
	}
})
