// controllers/marketStatusController.js
import prisma from '../config/db.js';

export const getMarketStatus = async (req, res) => {
  try {
    const marketStatus = await prisma.marketStatus.findFirst({
      orderBy: { last_updated_at: 'desc' },
      include: {
        updated_by_user: {
          select: {
            username: true,
            email: true
          }
        }
      }
    });

    if (!marketStatus) {
      // Create default market status
      const defaultStatus = await prisma.marketStatus.create({
        data: {
          status: 'closed',
          open_time: '10:00',
          close_time: '18:00'
        },
        include: {
          updated_by_user: {
            select: {
              username: true,
              email: true
            }
          }
        }
      });
      
      return res.json({
        success: true,
        marketStatus: defaultStatus,
        isMarketOpen: false,
        currentTime: new Date().toLocaleTimeString()
      });
    }

    // Use the already calculated isMarketOpen from middleware
    res.json({
      success: true,
      marketStatus,
      isMarketOpen: req.isMarketOpen || false,
      currentTime: new Date().toLocaleTimeString(),
      tradingHours: `${marketStatus.open_time} to ${marketStatus.close_time}`
    });
  } catch (error) {
    console.error('Error getting market status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get market status'
    });
  }
};

export const updateMarketStatus = async (req, res) => {
  try {
    const { status, open_time, close_time } = req.body;
    
    // Validate input
    if (status && !['open', 'closed'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Status must be either "open" or "closed"'
      });
    }

    // Validate time format
    const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (open_time && !timeRegex.test(open_time)) {
      return res.status(400).json({
        success: false,
        message: 'Open time must be in HH:MM format (24-hour)'
      });
    }
    if (close_time && !timeRegex.test(close_time)) {
      return res.status(400).json({
        success: false,
        message: 'Close time must be in HH:MM format (24-hour)'
      });
    }

    // Get current market status
    const currentStatus = await prisma.marketStatus.findFirst({
      orderBy: { last_updated_at: 'desc' }
    });

    const updateData = {
      status: status || currentStatus?.status || 'closed',
      open_time: open_time || currentStatus?.open_time || '10:00',
      close_time: close_time || currentStatus?.close_time || '18:00',
      last_updated_by: req.user.id,
      last_updated_at: new Date()
    };

    const updatedStatus = await prisma.marketStatus.create({
      data: updateData,
      include: {
        updated_by_user: {
          select: {
            username: true,
            email: true
          }
        }
      }
    });

    res.json({
      success: true,
      message: `Market status updated to ${updatedStatus.status}`,
      marketStatus: updatedStatus
    });
  } catch (error) {
    console.error('Error updating market status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update market status'
    });
  }
};

export const getMarketStatusHistory = async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    
    const history = await prisma.marketStatus.findMany({
      orderBy: { last_updated_at: 'desc' },
      take: parseInt(limit),
      include: {
        updated_by_user: {
          select: {
            username: true,
            email: true
          }
        }
      }
    });

    res.json({
      success: true,
      history,
      count: history.length
    });
  } catch (error) {
    console.error('Error getting market status history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get market status history'
    });
  }
};