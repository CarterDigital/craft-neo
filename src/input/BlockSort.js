import $ from 'jquery'
import Garnish from 'garnish'

const BlockSort = Garnish.Drag.extend({

	$container: null,
	blocks: null,

	_draggeeBlocks: null,

	init(items, settings)
	{
		if(typeof settings === 'undefined' && $.isPlainObject(items))
		{
			settings = items
			items = null
		}

		settings = $.extend({}, BlockSort.defaults, settings)
		settings.axis = Garnish.Y_AXIS

		this.base(items, settings)

		this.$container = settings.container
		this.blocks = []
	},

	getHelperTargetX()
	{
		return this.$draggee.offset().left
	},

	getHelperTargetY()
	{
		const magnet = this.settings.magnetStrength

		if(magnet != 1)
		{
			const draggeeOffsetY = this.$draggee.offset().top
			return draggeeOffsetY + ((this.mouseY - this.mouseOffsetY - draggeeOffsetY) / magnet)
		}

		return this.base()
	},

	getBlockByElement($block)
	{
		return this.blocks.find(block => block.$container.is($block))
	},

	getParentBlock(block)
	{
		const $parentBlock = block.$container.parent().closest('.ni_block')

		return $parentBlock.length > 0 ? this.getBlockByElement($parentBlock) : false
	},

	onDragStart()
	{
		const that = this

		this._draggeeBlocks = []
		this.$draggee.each(function()
		{
			that._draggeeBlocks.push(that.getBlockByElement(this))
		})

		this.base()
		this._calculateMidpoints()
	},

	onDrag()
	{
		const midpoint = this._getClosestMidpoint()

		if(midpoint)
		{
			this._moveDraggeeToBlock(midpoint.block, midpoint.type, midpoint.direction)
		}

		this.base()
	},

	onDragStop()
	{
		const that = this
		this.$draggee.each(function()
		{
			const $block = $(this)
			const block = that.getBlockByElement($block)
			const isRoot = $block.parent().is(that.$container)

			if(isRoot)
			{
				block.setLevel(0)
			}
			else
			{
				const parentBlock = that.getParentBlock(block)

				block.setLevel(parentBlock.getLevel() + 1)
			}

			$block.find('.ni_block').each(function()
			{
				const $childBlock = $(this)
				const childBlock = that.getBlockByElement($childBlock)
				const parentBlock = that.getParentBlock(childBlock)

				childBlock.setLevel(parentBlock.getLevel() + 1)
			})
		})

		this.returnHelpersToDraggees()

		this.base()
	},

	addBlock(block)
	{
		this.blocks.push(block)

		this.addItems(block.$container)
	},

	removeBlock(block)
	{
		this.blocks = this.blocks.filter(b => b !== block)

		this.removeItems(block.$container)
	},

	_calculateMidpoints()
	{
		const margin = 10

		this._draggeeBlockY = this.$draggee.offset().top
		this._draggeeBlockHeight = this.$draggee.height() + margin

		this._currentMidpoints = []

		for(let block of this.blocks)
		{
			if(block.$container.closest(this.$draggee).length == 0)
			{
				const midpoints = this._getBlockMidpoints(block)

				for(let type of Object.keys(midpoints))
				{
					const position = midpoints[type]
					const direction = this._draggeeBlockY > position ?
						BlockSort.DIRECTION_UP :
						BlockSort.DIRECTION_DOWN

					this._currentMidpoints.push({
						block: block,
						position: position,
						type: type,
						direction: direction
					})
				}
			}
		}

		const endMidpoint = this.$container.offset().top + this.$container.height() + (margin / 2)
		this._currentMidpoints.push({
			block: null,
			position: endMidpoint,
			type: BlockSort.TYPE_END,
			direction: BlockSort.DIRECTION_DOWN
		})
	},

	_getClosestMidpoint()
	{
		let minDistance = Number.MAX_VALUE
		let maxDistance = Number.MIN_VALUE
		let closest = null

		for(let midpoint of this._currentMidpoints)
		{
			if(midpoint.direction === BlockSort.DIRECTION_UP)
			{
				const compareY = this.mouseY - this.mouseOffsetY

				if(compareY < midpoint.position && midpoint.position < minDistance)
				{
					minDistance = midpoint.position
					closest = midpoint
				}
			}
			else
			{
				const compareY = this.mouseY - this.mouseOffsetY + this._draggeeBlockHeight

				if(compareY > midpoint.position && midpoint.position > maxDistance)
				{
					maxDistance = midpoint.position
					closest = midpoint
				}
			}
		}

		return closest
	},

	_getBlockMidpoints(block)
	{
		const midpoints = {}

		const border = 1
		const margin = 10
		const padding = 14

		const isAncestorCollapsed = (block.$container.parent().closest('.ni_block.is-contracted').length > 0)

		if(!isAncestorCollapsed)
		{
			const offset = block.$container.offset().top

			const isExpanded = block.isExpanded()

			const blockHeight = block.$container.height()
			const topbarHeight = block.$topbarContainer.height()
			const contentHeight = isExpanded ? block.$contentContainer.height() : 0
			const childrenHeight = isExpanded ? block.$childrenContainer.height() : 0

			const parentBlock = this.getParentBlock(block)

			if(!parentBlock || this._validateDraggeeChildren(parentBlock))
			{
				midpoints[BlockSort.TYPE_CONTENT] = offset + (topbarHeight + contentHeight) / 2
			}

			if(childrenHeight > 0 && block.isExpanded() && this._validateDraggeeChildren(block))
			{
				const buttonsHeight = block.getButtons().$container.height()
				midpoints[BlockSort.TYPE_CHILDREN] = offset + blockHeight - border - (padding + buttonsHeight + margin) / 2
			}
		}

		return midpoints
	},

	_moveDraggeeToBlock: function(block, type = BlockSort.TYPE_CONTENT, direction = BlockSort.DIRECTION_DOWN)
	{
		switch(type)
		{
			case BlockSort.TYPE_CHILDREN:
			{
				if(direction === BlockSort.DIRECTION_UP && this.$draggee.closest(block.$container).length == 0)
				{
					block.$blocksContainer.append(this.$draggee)
				}
				else
				{
					const parentBlock = this.getParentBlock(block)

					if(this._validateDraggeeChildren(parentBlock))
					{
						block.$container.after(this.$draggee)
					}
				}
			}
			break
			case BlockSort.TYPE_END:
			{
				this.$container.append(this.$draggee)
			}
			break
			default:
			{
				if(direction === BlockSort.DIRECTION_UP)
				{
					block.$container.before(this.$draggee)
				}
				else
				{
					if(block.getBlockType().isParent() && block.isExpanded() && this._validateDraggeeChildren(block))
					{
						block.$blocksContainer.prepend(this.$draggee)
					}
					else
					{
						block.$container.after(this.$draggee)
					}
				}
			}
		}

		this._updateHelperAppearance()
		this._calculateMidpoints()
	},

	_validateDraggeeChildren(block)
	{
		const blockType = block.getBlockType()

		for(let draggeeBlock of this._draggeeBlocks)
		{
			if(!blockType.isValidChildBlock(draggeeBlock))
			{
				return false
			}
		}

		return true
	},

	_updateHelperAppearance()
	{
		for(let $helper of this.helpers)
		{
			const id = $helper.data('neo-b-id')
			const block = this.blocks.find(b => b.$container.data('neo-b-id') == id)

			$helper.css({
				width: block.$container.width() + 1,
				height: block.$container.height()
			})
		}
	}

}, {

	TYPE_CONTENT: 'content',
	TYPE_CHILDREN: 'children',
	TYPE_END: 'end',
	DIRECTION_UP: 'up',
	DIRECTION_DOWN: 'down',

	defaults: {
		container: null,
		magnetStrength: 1
	}
})

export default BlockSort
