size_fail = 2_000_000;

class Match {
    constructor(bin, item) {
        this.bin = bin;
        this.item = item;
        this.loss = bin.height * bin.width - item.height * item.width;
    }
}

class Item {
    constructor(name, width, height) {
        this.placed = false;
        this.x = -1;
        this.y = -1;
        this.name = name;
        this.width = width;
        this.height = height;
    }
}

class Bin {
    constructor(largest_item) {
        this.bottom = null;
        this.right = null;
        this.width = largest_item.width;
        this.height = largest_item.height;
    }

    checkFit( item ) {
        if( this.bottom == null && this.right == null ) {
            if( item.width <= this.width && item.height <= this.height ) {
                return new Match( this, item );
            }
            else {
                return null;
            }
        }

        bottom_fit = null;
        right_fit = null;

        if( this.bottom != null ) {
            bottom_fit = this.bottom.checkFit( item );
        }

        if( this.right != null ) {
            right_fit = this.right.checkFit( item );
        }

        if( bottom_fit == null ) {
            if( right_fit == null ) {
                return null;
            }
            return right_fit;
        }
        else if( right_fit == null ) {
            return bottom_fit;
        }
        else if( bottom_fit.loss < right_fit.loss ) {
            return bottom_fit;
        }
        else {
            return right_fit;
        }
    }
}