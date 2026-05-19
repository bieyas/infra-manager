import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/**
 * Log port changes for ODC/ODP entities
 * @param {Object} params - Logging parameters
 * @param {string} params.entityType - 'ODC' | 'ODP'
 * @param {string} params.entityId - Entity ID
 * @param {Object} params.oldPortInfo - Old port information
 * @param {Object} params.newPortInfo - New port information
 * @param {string} params.changeType - 'CREATE' | 'UPDATE' | 'DELETE'
 * @param {string} params.changedBy - User ID who made the change
 * @param {string} params.changedByName - User name
 * @param {string} params.reason - Reason for change (optional)
 */
export async function logPortChange({
  entityType,
  entityId,
  oldPortInfo = null,
  newPortInfo = null,
  changeType,
  changedBy,
  changedByName = null,
  reason = null
}) {
  try {
    await prisma.portChangeLog.create({
      data: {
        entityType,
        entityId,
        oldPortInfo,
        newPortInfo,
        changeType,
        reason,
        changedBy,
        changedByName
      }
    })
    
    console.log(`Port change logged: ${entityType} ${entityId} - ${changeType}`)
  } catch (error) {
    console.error('Failed to log port change:', error)
    // Don't throw error - logging should not break the main operation
  }
}

/**
 * Get port change logs for an entity
 * @param {string} entityType - 'ODC' | 'ODP'
 * @param {string} entityId - Entity ID
 * @returns {Promise<Array>} Array of change logs
 */
export async function getPortChangeLogs(entityType, entityId) {
  try {
    return await prisma.portChangeLog.findMany({
      where: {
        entityType,
        entityId
      },
      orderBy: {
        createdAt: 'desc'
      }
    })
  } catch (error) {
    console.error('Failed to get port change logs:', error)
    return []
  }
}

/**
 * Get all port change logs by user
 * @param {string} userId - User ID
 * @returns {Promise<Array>} Array of change logs
 */
export async function getPortChangeLogsByUser(userId) {
  try {
    return await prisma.portChangeLog.findMany({
      where: {
        changedBy: userId
      },
      orderBy: {
        createdAt: 'desc'
      }
    })
  } catch (error) {
    console.error('Failed to get port change logs by user:', error)
    return []
  }
}
